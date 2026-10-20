import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  const openapi = new DocumentBuilder()
    .setTitle('CQRS Airline API')
    .setDescription(
      'Commands write to the write database through the Airplane aggregate (pessimistic lock). ' +
        'Queries read denormalized models from the read database, filled asynchronously by the projector ' +
        'via Debezium → Kafka. After a command, poll a query until writeVersion >= the returned version.',
    )
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openapi), {
    swaggerOptions: { tagsSorter: 'alpha', operationsSorter: 'alpha', persistAuthorization: true },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port} (Swagger UI at /docs)`);
}

void bootstrap();
