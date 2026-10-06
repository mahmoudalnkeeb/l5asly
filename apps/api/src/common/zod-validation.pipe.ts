import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";

// A ZodError becomes a 400 VALIDATION_ERROR response in ApiExceptionFilter.
export class ZodValidationPipe<Schema extends z.ZodType>
  implements PipeTransform<unknown, z.infer<Schema>>
{
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.infer<Schema> {
    return this.schema.parse(value);
  }
}
