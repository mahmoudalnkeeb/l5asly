import { Container, Typography } from "@mui/material";
import { SummaryForm } from "@/features/summaries/summary-form";

export function CreateSummaryPage() {
  return (
    <Container
      maxWidth="lg"
      component="section"
      sx={{ pt: { xs: 3, sm: 4 }, pb: 4 }}
    >
      <Typography
        variant="h1"
        sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem" } }}
      >
        Summarize a video
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        Upload a file or paste a link to get a summary, watch verdict, and
        transcript.
      </Typography>
      <SummaryForm />
    </Container>
  );
}
