import { Param } from "@nestjs/common";
import { z } from "zod";

import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

const summaryIdSchema = z.string().uuid();

export function SummaryIdParam(): ParameterDecorator {
  return Param("summaryId", new ZodValidationPipe(summaryIdSchema));
}
