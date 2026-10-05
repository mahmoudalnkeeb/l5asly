import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Check, Clock3, FileVideo, Link, ListChecks, LoaderCircle, LockKeyhole, Search, Upload } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import {
  MAX_EXPECTATION_LENGTH,
  SUMMARY_LANGUAGES,
  isYouTubeHostname,
  isYouTubeUrl,
  summaryDepthSchema,
  summaryLanguageSchema,
} from "@l5sly/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createUploadSummary,
  createUrlSummary,
  getErrorMessage,
} from "@/lib/api-client";

const formSchema = z.object({
  language: summaryLanguageSchema,
  depth: summaryDepthSchema,
  expectation: z.string().trim().max(MAX_EXPECTATION_LENGTH).optional(),
  sourceType: z.enum(["upload", "url"]),
  url: z.string().trim().optional(),
  file: z.instanceof(File).optional(),
}).superRefine((values, context) => {
  if (values.sourceType === "upload" && !values.file) {
    context.addIssue({ code: "custom", path: ["file"], message: "Choose a video or audio file." });
  }

  if (values.sourceType === "url") {
    const parsedUrl = z.url().safeParse(values.url);
    const isHttpUrl = parsedUrl.success
      && (parsedUrl.data.startsWith("http://") || parsedUrl.data.startsWith("https://"));
    const isMalformedYouTubeUrl = isHttpUrl && isYouTubeHostname(parsedUrl.data) && !isYouTubeUrl(parsedUrl.data);
    if (!isHttpUrl || isMalformedYouTubeUrl) {
      context.addIssue({ code: "custom", path: ["url"], message: "Enter a YouTube link or complete HTTP/HTTPS video URL." });
    }
  }
});

type SummaryFormValues = z.infer<typeof formSchema>;

const outcomeItems = [
  { icon: Check, title: "Quick verdict", detail: "Know whether the video is worth watching." },
  { icon: ListChecks, title: "Key takeaways", detail: "The most useful ideas without the filler." },
  { icon: Clock3, title: "Timestamped notes", detail: "Jump directly to important moments." },
  { icon: Search, title: "Full transcript", detail: "Search or revisit anything later." },
];

const depthDescriptions = {
  quick: "A concise answer with the most useful moments.",
  detailed: "More context, sections, and supporting notes.",
  study: "The fullest brief for review and reference.",
} as const;

export function SummaryForm() {
  const navigate = useNavigate();
  const fileInputId = useId();
  const [fileName, setFileName] = useState<string>();
  const form = useForm<SummaryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sourceType: "upload",
      language: "English",
      depth: "quick",
      expectation: "",
      url: "",
    },
  });
  const sourceType = form.watch("sourceType");
  const expectation = form.watch("expectation") ?? "";
  const depth = form.watch("depth");

  const createSummary = useMutation({
    mutationFn: async (values: SummaryFormValues) => {
      if (values.sourceType === "upload" && values.file) {
        return createUploadSummary({
          file: values.file,
          options: {
            language: values.language,
            depth: values.depth,
            expectation: values.expectation,
          },
        });
      }

      return createUrlSummary({
        url: values.url ?? "",
        language: values.language,
        depth: values.depth,
        expectation: values.expectation,
      });
    },
    onSuccess: (job) => navigate(`/summaries/${job.id}`),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  function selectSource(value: string): void {
    if (value !== "upload" && value !== "url") {
      return;
    }
    form.setValue("sourceType", value, { shouldValidate: false });
    form.clearErrors(["file", "url"]);
  }

  function handleFile(file: File | undefined): void {
    form.setValue("file", file, { shouldValidate: true });
    setFileName(file?.name);
  }

  function trySample(): void {
    form.setValue("sourceType", "url");
    form.setValue("url", "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav");
    void form.handleSubmit((values) => createSummary.mutate(values))();
  }

  return (
    <Card className="overflow-hidden border-border/90 bg-card shadow-[0_24px_70px_-48px_oklch(0.25_0.04_140_/_0.32)]">
      <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.72fr)]">
        <CardContent className="p-5 sm:p-8 lg:p-10">
          <Form {...form}>
            <form className="space-y-6" noValidate onSubmit={form.handleSubmit((values) => createSummary.mutate(values))}>
              <FormField
                control={form.control}
                name="sourceType"
                render={() => (
                  <FormItem>
                    <Tabs value={sourceType} onValueChange={selectSource}>
                      <TabsList className="grid h-11 w-full grid-cols-2 items-stretch rounded-lg border border-border/80 bg-muted/55 p-1 sm:w-96">
                        <TabsTrigger
                          className="!h-full min-h-0 py-0 leading-none data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/80"
                          value="upload"
                        >
                          <Upload />Upload video
                        </TabsTrigger>
                        <TabsTrigger
                          className="!h-full min-h-0 py-0 leading-none data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/80"
                          value="url"
                        >
                          <Link />Paste a link
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="upload" className="mt-5">
                        <FormField
                          control={form.control}
                          name="file"
                          render={() => (
                            <FormItem>
                              <FormControl>
                                <label
                                  htmlFor={fileInputId}
                                  className="grid min-h-48 cursor-pointer place-items-center rounded-xl border border-dashed border-ring/60 bg-accent/5 p-7 text-center transition-[background-color,border-color] hover:border-ring hover:bg-accent/10 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 sm:p-8"
                                >
                                  <Input
                                    id={fileInputId}
                                    className="sr-only"
                                    type="file"
                                    accept="video/*,audio/*"
                                    onChange={(event) => handleFile(event.target.files?.[0])}
                                  />
                                  <span>
                                    <span className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                                      {fileName ? <FileVideo className="size-6" /> : <Upload className="size-6" />}
                                    </span>
                                    {fileName ? (
                                      <span className="block max-w-lg truncate font-semibold">{fileName}</span>
                                    ) : (
                                      <>
                                        <span className="block font-semibold">Drop your video here</span>
                                        <span className="mt-1 block text-sm text-muted-foreground">or choose a file</span>
                                      </>
                                    )}
                                    <span className="mt-3 block font-mono text-xs text-muted-foreground">
                                      {fileName ? "Choose again to replace this file" : "MP4, MOV, WebM · Up to 1 GB"}
                                    </span>
                                  </span>
                                </label>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>

                      <TabsContent value="url" className="mt-5">
                        <FormField
                          control={form.control}
                          name="url"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Public video URL</FormLabel>
                              <FormControl><Input type="url" placeholder="https://youtube.com/watch?v=..." {...field} /></FormControl>
                              <FormDescription>
                                {field.value && isYouTubeUrl(field.value)
                                  ? "In live mode, YouTube audio is downloaded securely for transcription."
                                  : "Use a YouTube link or a publicly accessible video/audio URL."}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>
                    </Tabs>
                  </FormItem>
                )}
              />

              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5 shrink-0" />
                Your uploaded video is deleted after processing.
              </p>

              <FormField
                control={form.control}
                name="expectation"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-4">
                      <FormLabel>Anything specific you want to know?</FormLabel>
                      <span className="text-xs text-muted-foreground">Optional</span>
                    </div>
                    <FormControl>
                      <Textarea
                        rows={3}
                        maxLength={MAX_EXPECTATION_LENGTH}
                        placeholder="e.g. What are the main arguments? Is this worth watching for a backend developer?"
                        {...field}
                      />
                    </FormControl>
                    <div className="flex justify-between gap-4">
                      <FormDescription>We’ll prioritize this in your summary.</FormDescription>
                      <span className="text-xs text-muted-foreground">{expectation.length} / {MAX_EXPECTATION_LENGTH}</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <details className="group pt-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  Advanced options
                  <span className="text-xs transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
                </summary>
                <div className="mt-3 grid items-start gap-5 border-t pt-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Summary language</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {SUMMARY_LANGUAGES.map((language) => <SelectItem key={language} value={language}>{language}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="depth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Summary depth</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="quick">Quick read</SelectItem>
                            <SelectItem value="detailed">Detailed</SelectItem>
                            <SelectItem value="study">Study notes</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>{depthDescriptions[depth]}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </details>

              {createSummary.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not start the summary</AlertTitle>
                  <AlertDescription>{getErrorMessage(createSummary.error)}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-52" disabled={createSummary.isPending}>
                  {createSummary.isPending ? <><LoaderCircle className="animate-spin motion-reduce:animate-none" />Starting</> : "Create summary"}
                </Button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  onClick={trySample}
                  disabled={createSummary.isPending}
                >
                  No video handy? <span className="font-semibold text-foreground">Try a sample →</span>
                </button>
              </div>
              <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                <Clock3 className="mt-1 size-4 shrink-0" />
                Quick summaries can still take several minutes. You can follow progress from your library.
              </p>
            </form>
          </Form>
        </CardContent>

        <aside className="border-t bg-muted/45 p-6 lg:border-l lg:border-t-0 lg:p-9" aria-labelledby="outcomes-title">
          <div className="mb-8">
            <h2 id="outcomes-title" className="text-xl font-bold tracking-[-0.02em]">You’ll get</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">A focused way to decide what deserves your time.</p>
          </div>
          <div className="grid gap-6">
            {outcomeItems.map((item) => (
              <div key={item.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-card/70"><item.icon className="size-4" /></span>
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Card>
  );
}
