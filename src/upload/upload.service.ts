import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import csvParser from 'csv-parser';
import pLimit from 'p-limit';
import { UploadData, UploadDataDocument } from './upload.schema';

@Injectable()
export class UploadDataService {
  constructor(
    @InjectModel(UploadData.name)
    private readonly uploadDataModel: Model<UploadDataDocument>,
  ) { }

  // --- New helper: validate records using mongoose validators (replacement for runValidators on insertMany)
  private async validateRecords(records: any[]): Promise<any[]> {
    if (!records.length) return [];
    const validated: any[] = [];

    for (const rec of records) {
      try {
        const inst = new this.uploadDataModel(rec);
        await inst.validate(); // throws if invalid
        validated.push(rec);
      } catch (err) {
        console.log('[UPLOAD][VALIDATION SKIP] record skipped due to validation error:', err?.message || err);
        // skip invalid record
      }
    }

    return validated;
  }

  // --- Deduplicate:
  // If ticketRefId present on incoming rows, dedupe by ticketRefId.
  // Else fallback to description+category+subCategory.
  private async filterDuplicates(records: any[]): Promise<any[]> {
    if (!records.length) return [];

    const candidatesById = records.filter(r => typeof r.ticketRefId === 'string' && r.ticketRefId.trim() !== '');
    const candidatesByKey = records.filter(r =>
      (typeof r.ticketRefId !== 'string' || r.ticketRefId.trim() === '') &&
      typeof r.description === 'string' && r.description.trim() !== '' &&
      typeof r.category === 'string' && r.category.trim() !== '' &&
      typeof r.subCategory === 'string' && r.subCategory.trim() !== ''
    );

    // Build compact queries using $in for ids and a small $or for composite keys
    const existingIdSet = new Set<string>();
    const existingKeySet = new Set<string>();

    if (candidatesById.length) {
      const ids = candidatesById.map(r => r.ticketRefId.trim());
      const existingById = await this.uploadDataModel.find({ ticketRefId: { $in: ids } })
        .select('ticketRefId').lean();
      existingById.forEach(e => existingIdSet.add(String(e.ticketRefId).trim()));
    }

    if (candidatesByKey.length) {
      const keyOrQueries = candidatesByKey.map(r => ({
        description: r.description,
        category: r.category,
        subCategory: r.subCategory,
      }));
      if (keyOrQueries.length) {
        const existingByKey = await this.uploadDataModel.find({ $or: keyOrQueries })
          .select('description category subCategory').lean();
        existingByKey.forEach(e => {
          const key = `${e.description}||${e.category}||${e.subCategory}`;
          existingKeySet.add(key);
        });
      }
    }

    const filtered = records.filter(r => {
      const idKey = (r.ticketRefId && String(r.ticketRefId).trim()) ? String(r.ticketRefId).trim() : null;
      const keyKey = (r.description || r.category || r.subCategory) ? `${r.description}||${r.category}||${r.subCategory}` : null;

      if (idKey && existingIdSet.has(idKey)) return false;
      if (keyKey && existingKeySet.has(keyKey)) return false;
      return true;
    });

    return filtered;
  }

  // --- Parse wrapper
  async parseFileAndSave(filePath: string, fileSize: number): Promise<any> {
    try {
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (fileSize > maxSize) {
        fs.unlinkSync(filePath);
        throw new BadRequestException('File exceeds 200MB limit');
      }

      // --- Parse CSV/Excel
      const ext = path.extname(filePath).toLowerCase();
      let result;
      if (ext === '.csv') result = await this.handleCsv(filePath);
      else if (ext === '.xlsx') result = await this.handleExcel(filePath);
      else {
        fs.unlinkSync(filePath);
        throw new BadRequestException('Only CSV or Excel (.xlsx) allowed');
      }

      fs.unlinkSync(filePath);
      return result;
    } catch (error) {
      console.error('❌ Parsing failed:', error);
      throw new BadRequestException(error.message);
    }
  }

  // --- CSV handler (header normalization + ticketRefId mapping)
  private async handleCsv(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const batch: any[] = [];
      const chunkSize = 2000;
      let totalCount = 0;

      const limit = pLimit(5);
      const tasks: Promise<any>[] = [];

      let rowIndex = 0;
      const stream = fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', row => {
          rowIndex++;

          // Log first parsed row (raw) to help debug header names
          if (rowIndex === 1) {
            console.log('[UPLOAD][DEBUG] first CSV row parsed (raw headers):', row);
          }

          // Normalize keys: lowercase, remove spaces and underscores
          const normalized: any = {};
          for (const key of Object.keys(row)) {
            const normKey = key.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
            normalized[normKey] = row[key];
          }

          // ********** FIX: compute rawTicketRef and only include if non-empty **********
          const rawTicketRef = (normalized['ticketrefid'] || normalized['ticketref'] || normalized['ticketid'] || '').toString().trim();

          const record: any = {
            ...(rawTicketRef ? { ticketRefId: rawTicketRef } : {}),
            description: String(normalized['description'] || '').slice(0, 16000),
            remark: String(normalized['remark'] || normalized['remarks'] || '').slice(0, 16000),
            category: normalized['category'] || '',
            subCategory: normalized['subcategory'] || normalized['sub-category'] || '',
            status: normalized['status'] || 'Raised',
          };

          // Skip records missing required description
          if (!record.description || record.description.trim() === '') {
            console.log('[UPLOAD][SKIP] skipping CSV row', rowIndex, '- missing description');
          } else {
            batch.push(record);
          }

          if (batch.length >= chunkSize) {
            const currentBatch = batch.splice(0, batch.length);
            tasks.push(limit(async () => {
              const newRecords = await this.filterDuplicates(currentBatch);
              if (newRecords.length) {
                console.log('[UPLOAD][DEBUG] sample doc before insert:', newRecords[0]);

                // ********** FIX: validateRecords then insertMany without runValidators **********
                const validatedRecords = await this.validateRecords(newRecords);
                if (validatedRecords.length) {
                  const inserted = await this.uploadDataModel.insertMany(validatedRecords, { ordered: false });
                  console.log('[UPLOAD] inserted chunk: requested=', validatedRecords.length, 'inserted=', inserted.length);
                  totalCount += inserted.length;
                } else {
                  console.log('[UPLOAD] chunk skipped (all invalid after validation) requested=', newRecords.length);
                }
              } else {
                console.log('[UPLOAD] chunk skipped (all duplicates) requested=', currentBatch.length);
              }
            }));
          }
        })
        .on('end', async () => {
          try {
            if (batch.length > 0) {
              tasks.push(limit(async () => {
                const newRecords = await this.filterDuplicates(batch);
                if (newRecords.length) {
                  console.log('[UPLOAD][DEBUG] sample doc before final insert:', newRecords[0]);

                  const validatedRecords = await this.validateRecords(newRecords);
                  if (validatedRecords.length) {
                    const inserted = await this.uploadDataModel.insertMany(validatedRecords, { ordered: false });
                    console.log('[UPLOAD] inserted final chunk: requested=', validatedRecords.length, 'inserted=', inserted.length);
                    totalCount += inserted.length;
                  } else {
                    console.log('[UPLOAD] final chunk skipped (all invalid after validation) requested=', newRecords.length);
                  }
                } else {
                  console.log('[UPLOAD] final chunk skipped (all duplicates) requested=', batch.length);
                }
              }));
            }
            await Promise.all(tasks);

            console.log('[UPLOAD] totalInserted=', totalCount);
            if (totalCount === 0) {
              throw new BadRequestException('All records in the file already exist');
            }

            resolve({ message: 'File uploaded successfully', totalRecords: totalCount });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', err => reject(err));
    });
  }

  // --- Excel handler (header normalization + ticketRefId mapping)
  private async handleExcel(filePath: string): Promise<any> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, { entries: 'emit' });
    const batch: any[] = [];
    const chunkSize = 2000;
    let totalCount = 0;
    const limit = pLimit(5);
    const tasks: Promise<any>[] = [];

    let sheetIndex = 0;
    for await (const worksheet of workbook) {
      sheetIndex++;
      let headers: string[] = [];
      let normalizedHeaders: string[] = [];
      let rowNumber = 0;

      for await (const row of worksheet) {
        rowNumber++;
        if (row.number === 1) {
          headers = (row.values as any[]).slice(1).map(v => v ? String(v).trim() : '');
          // normalize headers for consistent keys
          normalizedHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, '').replace(/_/g, ''));
          console.log(`[UPLOAD][DEBUG] excel sheet ${sheetIndex} headers (raw):`, headers.slice(0, 20));
          console.log(`[UPLOAD][DEBUG] excel sheet ${sheetIndex} headers (normalized):`, normalizedHeaders.slice(0, 20));
          continue;
        }

        const rowData: any = {};
        (row.values as any[]).slice(1).forEach((val, idx) => {
          const key = normalizedHeaders[idx] || (headers[idx] ? headers[idx].toLowerCase().replace(/\s+/g, '').replace(/_/g, '') : `col${idx}`);
          rowData[key] = val ? String(val).trim().slice(0, 16000) : '';
        });

        if (rowNumber === 2) {
          console.log(`[UPLOAD][DEBUG] excel sheet ${sheetIndex} first data row mapped:`, rowData);
        }

        // ********** FIX: compute rawTicketRef and only include when non-empty **********
        const rawTicketRef = (rowData['ticketrefid'] || rowData['ticketref'] || rowData['ticketid'] || '').toString().trim();

        const record: any = {
          ...(rawTicketRef ? { ticketRefId: rawTicketRef } : {}),
          description: rowData['description'] || '',
          remark: rowData['remark'] || rowData['remarks'] || '',
          category: rowData['category'] || '',
          subCategory: rowData['subcategory'] || rowData['sub-category'] || '',
          status: rowData['status'] || 'Raised',
        };

        if (!record.description || record.description.trim() === '') {
          console.log('[UPLOAD][SKIP] skipping excel row - missing description at row', rowNumber);
        } else {
          batch.push(record);
        }

        if (batch.length >= chunkSize) {
          const currentBatch = batch.splice(0, batch.length);
          tasks.push(limit(async () => {
            const newRecords = await this.filterDuplicates(currentBatch);
            if (newRecords.length) {
              console.log('[UPLOAD][DEBUG] sample doc before insert (excel):', newRecords[0]);

              const validatedRecords = await this.validateRecords(newRecords);
              if (validatedRecords.length) {
                const inserted = await this.uploadDataModel.insertMany(validatedRecords, { ordered: false });
                console.log('[UPLOAD] inserted chunk: requested=', validatedRecords.length, 'inserted=', inserted.length);
                totalCount += inserted.length;
              } else {
                console.log('[UPLOAD] chunk skipped (all invalid after validation) requested=', newRecords.length);
              }
            } else {
              console.log('[UPLOAD] chunk skipped (all duplicates) requested=', currentBatch.length);
            }
          }));
        }
      }
    }

    if (batch.length > 0) {
      tasks.push(limit(async () => {
        const newRecords = await this.filterDuplicates(batch);
        if (newRecords.length) {
          console.log('[UPLOAD][DEBUG] sample doc before final insert (excel):', newRecords[0]);

          const validatedRecords = await this.validateRecords(newRecords);
          if (validatedRecords.length) {
            const inserted = await this.uploadDataModel.insertMany(validatedRecords, { ordered: false });
            console.log('[UPLOAD] inserted final chunk: requested=', validatedRecords.length, 'inserted=', inserted.length);
            totalCount += inserted.length;
          } else {
            console.log('[UPLOAD] final chunk skipped (all invalid after validation) requested=', newRecords.length);
          }
        } else {
          console.log('[UPLOAD] final chunk skipped (all duplicates) requested=', batch.length);
        }
      }));
    }

    await Promise.all(tasks);
    console.log('[UPLOAD] totalInserted=', totalCount);
    if (totalCount === 0) {
      throw new BadRequestException('All records in the file already exist');
    }
    return { message: 'File uploaded successfully', totalRecords: totalCount };
  }

  // --- Fetch/filter
  async filterData(filters: any = {}): Promise<any[]> {
    const query: any = {};

    if (filters.ticketRefId) {
      query.ticketRefId = filters.ticketRefId.trim();
    }

    if (filters.category) query.category = filters.category;
    if (filters.subCategory) query.subCategory = filters.subCategory;
    if (filters.description) query.description = filters.description;
    if (filters.status && filters.status.toLowerCase() !== 'all') query.status = filters.status;

    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate); end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    return this.uploadDataModel.find(query, { _id: 0, __v: 0 }).lean();
  }

  // --- Export
  async exportData(filters: any = {}, format: 'excel' | 'csv' = 'excel') {
    const data = await this.filterData(filters);
    if (!data.length) throw new BadRequestException('No records found');

    const filename = `upload_export_${Date.now()}.${format === 'excel' ? 'xlsx' : 'csv'}`;
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir);
    const filePath = path.join(exportsDir, filename);

    if (format === 'csv') {
      const headers = Object.keys(data[0]);
      const rows = data.map(t => headers.map(h => t[h] ?? '').join(','));
      fs.writeFileSync(filePath, [headers.join(','), ...rows].join('\n'), 'utf8');
    } else {
      // --- Streaming Excel Writer
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        filename: filePath,
        useStyles: true,
        useSharedStrings: true,
      });

      const worksheet = workbook.addWorksheet('UploadData');

      // Define headers
      worksheet.columns = Object.keys(data[0]).map(key => ({
        header: key,
        key: key,
        width: 20
      }));

      // Add rows as a stream
      for (const record of data) {
        worksheet.addRow(record).commit(); // commit each row immediately
      }

      await workbook.commit(); // write the file to disk
    }

    return { url: `http://localhost:3000/exports/${filename}`, filename };
  }

  async deleteFileById(id: string): Promise<boolean> {
    const result = await this.uploadDataModel.findByIdAndDelete(id);
    return !!result; // true if deleted, false if not found
  }

}
