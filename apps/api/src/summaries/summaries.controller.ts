import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import {
  createUrlSummarySchema,
  precheckRequestSchema,
  videoPreviewRequestSchema,
  type CreateUrlSummaryInput,
  type PrecheckRequest,
  type PrecheckResult,
  type SummaryJob,
  type SummaryListItem,
  type SummaryOptions,
  type VideoPreview,
  type VideoPreviewRequest,
} from "@l5asly/contracts";

import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PrecheckService } from "./services/precheck.service.js";
import { SummariesService } from "./services/summaries.service.js";
import { SummaryIdParam } from "./summary-id-param.decorator.js";
import { DiscardRejectedUploadInterceptor } from "./uploads/discard-rejected-upload.interceptor.js";
import { UploadSummaryOptionsPipe } from "./uploads/upload-summary-options.pipe.js";
import {
  UploadedMediaPipe,
  type UploadedMedia,
} from "./uploads/uploaded-media.pipe.js";

// Responses are wrapped in `{ data }` by ResponseEnvelopeInterceptor.
@Controller("summaries")
export class SummariesController {
  constructor(
    private readonly summaries: SummariesService,
    private readonly precheckService: PrecheckService,
  ) {}

  @Post("precheck")
  @HttpCode(HttpStatus.OK)
  precheck(
    @Body(new ZodValidationPipe(precheckRequestSchema)) input: PrecheckRequest,
  ): Promise<PrecheckResult> {
    return this.precheckService.check(input);
  }

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(videoPreviewRequestSchema))
    input: VideoPreviewRequest,
  ): Promise<VideoPreview> {
    return this.precheckService.preview(input.url);
  }

  @Post("url")
  @HttpCode(HttpStatus.ACCEPTED)
  createFromUrl(
    @Body(new ZodValidationPipe(createUrlSummarySchema))
    input: CreateUrlSummaryInput,
  ): Promise<SummaryJob> {
    return this.summaries.createFromUrl(input);
  }

  @Post("upload")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor("video"), DiscardRejectedUploadInterceptor)
  createFromUpload(
    @UploadedFile(new UploadedMediaPipe({ isRequired: true }))
    media: UploadedMedia,
    @Body(UploadSummaryOptionsPipe) options: SummaryOptions,
  ): Promise<SummaryJob> {
    return this.summaries.createFromUpload(media, options);
  }

  @Get()
  listRecent(): Promise<SummaryListItem[]> {
    return this.summaries.listRecent();
  }

  @Get(":summaryId")
  findById(@SummaryIdParam() summaryId: string): Promise<SummaryJob> {
    return this.summaries.findById(summaryId);
  }

  @Post(":summaryId/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(@SummaryIdParam() summaryId: string): Promise<SummaryJob> {
    return this.summaries.cancel(summaryId);
  }

  // The optional `video` field replaces media that expired before the retry.
  @Post(":summaryId/retry")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor("video"), DiscardRejectedUploadInterceptor)
  retry(
    @SummaryIdParam() summaryId: string,
    @UploadedFile(new UploadedMediaPipe({ isRequired: false }))
    media: UploadedMedia | undefined,
  ): Promise<SummaryJob> {
    return this.summaries.retry(summaryId, media);
  }

  @Delete(":summaryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@SummaryIdParam() summaryId: string): Promise<void> {
    return this.summaries.delete(summaryId);
  }
}
