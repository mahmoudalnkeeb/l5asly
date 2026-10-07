import { Box, Container, Typography } from "@mui/material";
import { SummaryForm } from "@/features/summaries/summary-form";

export function CreateSummaryPage() {
  return (
    <Container
      maxWidth="lg"
      component="section"
      aria-labelledby="create-summary-title"
      sx={{ pt: { xs: 5, sm: 8 }, pb: 8 }}
    >
      <Box sx={{ textAlign: "center", maxWidth: 640, mx: "auto", mb: 4 }}>
        <Typography
          variant="h1"
          id="create-summary-title"
          sx={{
            fontSize: { xs: "2rem", sm: "2.75rem" },
            fontWeight: 600,
            letterSpacing: "-0.025em",
            lineHeight: 1.12,
            textWrap: "balance",
          }}
        >
          Is this video{" "}
          <Box component="span" sx={{ color: "primary.main" }}>
            worth your time?
          </Box>
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5, fontSize: "1.0625rem" }}>
          Paste a link and say what you want from it. You get a verdict in
          seconds and the brief in a few minutes.
        </Typography>
      </Box>
      <SummaryForm />
    </Container>
  );
}
