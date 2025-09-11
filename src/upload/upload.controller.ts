import { Controller, Post, Get, Delete, Param, UploadedFile, UseInterceptors, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadDataService } from './upload.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Express } from 'express';

@Controller('upload-data')
export class UploadDataController {
  constructor(private readonly uploadDataService: UploadDataService) { }


  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      fileFilter: (_, file, cb) => {
        const allowed = [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Only CSV or Excel files are allowed'), false);
      },
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File): Promise<any> {
    if (!file) throw new BadRequestException('File not provided');
    return this.uploadDataService.parseFileAndSave(file.path, file.size);
  }

  @Post('fetch')
  async fetchData(
    @Body() filters: {
      category?: string;
      subCategory?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ) {
    const data = await this.uploadDataService.filterData(filters);
    return { message: 'Fetch successful', totalRecords: data.length, data };
  }

  @Post('export')
  async exportData(
    @Body() filters: {
      category?: string;
      subCategory?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      format?: 'excel' | 'csv';
    } = {},
  ) {
    const format = filters.format || 'excel';
    const { url, filename } = await this.uploadDataService.exportData(filters, format);
    return { message: 'Export successful', url, filename };
  }

  @Delete(':id')
  async deleteFile(@Param('id') id: string) {
    const deleted = await this.uploadDataService.deleteFileById(id);
    if (!deleted) {
      throw new NotFoundException('File not found');
    }
    return { message: 'File deleted successfully' };
  }
}
