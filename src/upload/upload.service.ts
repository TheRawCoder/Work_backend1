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

  // Validate records: must have ticketRefId, other fields can be empty
  private async validateRecords(records: any[]): Promise<any[]> {
    if (!records.length) return [];
    const validated: any[] = [];

    for (const rec of records) {
      // Only accept records with ticketRefId
      if (!rec.ticketRefId || typeof rec.ticketRefId !== 'string' || rec.ticketRefId.trim() === '') {
        console.log('[UPLOAD][VALIDATION SKIP] record skipped due to missing ticketRefId');
        continue;
      }
      // Ensure other fields are empty if not present
      validated.push({
        ticketRefId: rec.ticketRefId.trim(),
        description: rec.description ?? '',
        remark: rec.remark ?? '',
        category: rec.category ?? '',
        subCategory: rec.subCategory ?? '',
        status: rec.status ?? 'Raised',
      });
    }
    return validated;
  }

  // Optimized bulk upsert records by ticketRefId
  private async upsertRecords(records: any[]): Promise<number> {
    if (!records.length) return 0;
    const ops = records.map(rec => ({
      updateOne: {
        filter: { ticketRefId: rec.ticketRefId },
        update: { $set: rec },
        upsert: true
      }
    }));
    const result = await this.uploadDataModel.bulkWrite(ops, { ordered: false });
    return (result.upsertedCount || 0) + (result.modifiedCount || 0);
  }

  // Parse wrapper
  async parseFileAndSave(filePath: string, fileSize: number): Promise<any> {
    try {
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (fileSize > maxSize) {
        fs.unlinkSync(filePath);
        throw new BadRequestException('File exceeds 200MB limit');
      }

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

  // CSV handler
  private async handleCsv(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const batch: any[] = [];
      const chunkSize = 5000; // You can increase this for more speed if memory allows
      let totalCount = 0;
      const limit = pLimit(5);
      const tasks: Promise<any>[] = [];

      let rowIndex = 0;
      const stream = fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', row => {
          rowIndex++;

          // Normalize keys: lowercase, remove spaces and underscores
          const normalized: any = {};
          for (const key of Object.keys(row)) {
            const normKey = key.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
            normalized[normKey] = row[key];
          }

          const rawTicketRef = (normalized['ticketrefid'] || normalized['ticketref'] || normalized['ticketid'] || '').toString().trim();

          const record: any = {
            ticketRefId: rawTicketRef,
            description: String(normalized['description'] || '').slice(0, 16000),
            remark: String(normalized['remark'] || normalized['remarks'] || '').slice(0, 16000),
            category: normalized['category'] || '',
            subCategory: normalized['subcategory'] || normalized['sub-category'] || '',
            status: normalized['status'] || 'Raised',
          };

          batch.push(record);

          if (batch.length >= chunkSize) {
            const currentBatch = batch.splice(0, batch.length);
            tasks.push(limit(async () => {
              const validatedRecords = await this.validateRecords(currentBatch);
              if (validatedRecords.length) {
                const insertedCount = await this.upsertRecords(validatedRecords);
                totalCount += insertedCount;
              }
            }));
          }
        })
        .on('end', async () => {
          try {
            if (batch.length > 0) {
              tasks.push(limit(async () => {
                const validatedRecords = await this.validateRecords(batch);
                if (validatedRecords.length) {
                  const insertedCount = await this.upsertRecords(validatedRecords);
                  totalCount += insertedCount;
                }
              }));
            }
            await Promise.all(tasks);

            if (totalCount === 0) {
              throw new BadRequestException('No valid records with ticketRefId found or all records already exist.');
            }

            resolve({ message: 'File uploaded successfully', totalRecords: totalCount });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', err => reject(err));
    });
  }

  // Excel handler
  private async handleExcel(filePath: string): Promise<any> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, { entries: 'emit' });
    const batch: any[] = [];
    const chunkSize = 5000; // You can increase this for more speed if memory allows
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
          normalizedHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, '').replace(/_/g, ''));
          continue;
        }

        const rowData: any = {};
        (row.values as any[]).slice(1).forEach((val, idx) => {
          const key = normalizedHeaders[idx] || (headers[idx] ? headers[idx].toLowerCase().replace(/\s+/g, '').replace(/_/g, '') : `col${idx}`);
          rowData[key] = val ? String(val).trim().slice(0, 16000) : '';
        });

        const rawTicketRef = (rowData['ticketrefid'] || rowData['ticketref'] || rowData['ticketid'] || '').toString().trim();

        const record: any = {
          ticketRefId: rawTicketRef,
          description: rowData['description'] || '',
          remark: rowData['remark'] || rowData['remarks'] || '',
          category: rowData['category'] || '',
          subCategory: rowData['subcategory'] || rowData['sub-category'] || '',
          status: rowData['status'] || 'Raised',
        };

        batch.push(record);

        if (batch.length >= chunkSize) {
          const currentBatch = batch.splice(0, batch.length);
          tasks.push(limit(async () => {
            const validatedRecords = await this.validateRecords(currentBatch);
            if (validatedRecords.length) {
              const insertedCount = await this.upsertRecords(validatedRecords);
              totalCount += insertedCount;
            }
          }));
        }
      }
    }

    if (batch.length > 0) {
      tasks.push(limit(async () => {
        const validatedRecords = await this.validateRecords(batch);
        if (validatedRecords.length) {
          const insertedCount = await this.upsertRecords(validatedRecords);
          totalCount += insertedCount;
        }
      }));
    }

    await Promise.all(tasks);

    if (totalCount === 0) {
      throw new BadRequestException('No valid records with ticketRefId found or all records already exist.');
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