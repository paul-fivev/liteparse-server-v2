import { LiteParse, type LiteParseConfig } from "@llamaindex/liteparse";
import { SpanStatusCode } from "@opentelemetry/api";
import { PrefixedLogger } from "./logger";
import {
  tracer,
  parseDurationMs,
  parseFileSizeBytes,
  parsePagesCount,
  parseFilesTotal,
  parseErrorsTotal,
  screenErrorsTotal,
  screenDurationMs,
  screenPagesCount,
  screenFilesTotal,
  screenFileSizeBytes,
} from "./telemetry";

export const SCREENSHOT_MIMETYPE = "image/png";

export async function parse({
  file,
  text = false,
  config = undefined,
}: {
  file: Express.Multer.File;
  text?: boolean;
  config?: Partial<LiteParseConfig> | undefined;
}) {
  const logger = new PrefixedLogger("[parse]");
  const mode = text ? "text" : "pages";

  return tracer.startActiveSpan("parse", async (span) => {
    span.setAttributes({
      "file.name": file.originalname,
      "file.size": file.buffer.length,
      "file.mimetype": file.mimetype,
      "parse.mode": mode,
    });

    parseFileSizeBytes.record(file.buffer.length, { "parse.mode": mode });

    const lit = new LiteParse(config);
    logger.debug(
      `Starting to parse: ${file.originalname} (text = ${text ? "true" : "false"})`,
    );

    const startTime = performance.now();
    try {
      const result = await lit.parse(file.buffer);
      const duration = performance.now() - startTime;

      parseDurationMs.record(duration, { "parse.mode": mode });
      parsePagesCount.record(result.pages.length, { "parse.mode": mode });
      parseFilesTotal.add(1, { "parse.mode": mode });

      span.setAttributes({
        "parse.pages_count": result.pages.length,
        "parse.duration_ms": Math.round(duration),
      });

      logger.debug(
        `Finished parsing ${file.originalname} (text = ${text ? "true" : "false"})`,
      );
      span.end();

      if (text) {
        return result.text;
      } else {
        return result.pages;
      }
    } catch (err) {
      parseErrorsTotal.add(1, { "parse.mode": mode });
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      throw err;
    }
  });
}

export async function screenshot({
  file,
  pageNumbers = undefined,
  config = undefined,
}: {
  file: Express.Multer.File;
  pageNumbers?: number[] | undefined;
  config?: Partial<LiteParseConfig> | undefined;
}) {
  const logger = new PrefixedLogger("[screenshot]");

  return tracer.startActiveSpan("screenshot", async (span) => {
    screenFileSizeBytes.record(file.size);
    span.setAttributes({
      "file.name": file.originalname,
      "file.size": file.buffer.length,
      "file.mimetype": file.mimetype,
      "file.pages_to_screenshot": pageNumbers
        ? pageNumbers.map((n) => n.toString()).join(",")
        : "all",
    });

    const lit = new LiteParse(config);
    logger.debug(`Starting to screenshot: ${file.originalname}`);

    try {
      const startTime = performance.now();
      const result = await lit.screenshot(file.buffer, pageNumbers);
      const duration = performance.now() - startTime;

      screenDurationMs.record(duration);
      screenPagesCount.record(result.length);
      screenFilesTotal.add(1);

      span.setAttributes({
        "screenshot.pages_count": result.length,
        "screenshot.duration_ms": Math.round(duration),
      });

      logger.debug(
        `Finished screenshotting ${file.originalname} (pages = ${
          pageNumbers ? pageNumbers.map((n) => n.toString()).join(",") : "all"
        })`,
      );
      span.end();
      return result;
    } catch (err) {
      screenErrorsTotal.add(1);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      logger.error(`An error occurred: ${err}`);
      throw err;
    }
  });
}
