import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: ['http://localhost:4200'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true,
  });

  const exportsDir = join(process.cwd(), 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir);

  app.useStaticAssets(exportsDir, { prefix: '/exports/' });

  await app.listen(3000);

  console.log('MONGO_URI=', process.env.MONGO_URI);

}
bootstrap();
