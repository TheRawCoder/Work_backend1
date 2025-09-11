import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadData, UploadDataSchema } from './upload.schema';
import { UploadDataService } from './upload.service';
import { UploadDataController } from './upload.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: UploadData.name, schema: UploadDataSchema }],
    ),
  ],
  providers: [UploadDataService],
  controllers: [UploadDataController],
  exports: [UploadDataService],
})
export class UploadDataModule { }
