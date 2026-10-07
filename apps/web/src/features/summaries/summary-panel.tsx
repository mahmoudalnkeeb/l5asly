import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useId } from "react";

import type { SummaryResult } from "@l5asly/contracts";
import { formatTimestamp, getContentProps } from "./format";

interface SummaryPanelProps {
  result: SummaryResult;
  onSelectTime: (seconds: number) => void;
}

// List items below are keyed by position as well as text, because generated
// results can repeat a title or a step.
export function SummaryPanel({ result, onSelectTime }: SummaryPanelProps) {
  const viewingPlanTitleId = useId();
  const momentsTitleId = useId();
  const guidance = result.personalizedGuidance;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 300px" },
        gap: 4,
        alignItems: "start",
      }}
    >
      <Box component="article" sx={{ minWidth: 0 }}>
        {guidance ? (
          <Box
            component="section"
            aria-labelledby={viewingPlanTitleId}
            sx={{ mb: 4 }}
          >
            <Typography variant="h2" id={viewingPlanTitleId}>
              Your viewing plan
            </Typography>
            <Typography
              {...getContentProps(guidance.relevance)}
              color="text.secondary"
              sx={{ mt: 1.5 }}
            >
              {guidance.relevance}
            </Typography>
            {guidance.prerequisites.length ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h3">Before watching</Typography>
                {guidance.prerequisites.map((item, index) => (
                  <Box key={`${index}-${item.topic}`} sx={{ mt: 1.5 }}>
                    <Stack
                      direction="row"
                      sx={{
                        gap: 1,
                        alignItems: "baseline",
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography
                        {...getContentProps(item.topic)}
                        sx={{ fontWeight: 600 }}
                      >
                        {item.topic}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={
                          item.status === "already-known"
                            ? "Already familiar"
                            : "Prepare first"
                        }
                      />
                    </Stack>
                    <Typography
                      {...getContentProps(item.reason)}
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      {item.reason}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : null}
            {guidance.nextSteps.length ? (
              <>
                <Typography variant="h3" sx={{ mt: 2 }}>
                  Next steps
                </Typography>
                <Box
                  component="ul"
                  {...getContentProps(guidance.nextSteps.join(" "))}
                  sx={{
                    mt: 1,
                    mb: 0,
                    paddingInlineStart: 3,
                    listStyleType: "disc",
                  }}
                >
                  {guidance.nextSteps.map((step, index) => (
                    <Box
                      component="li"
                      key={`${index}-${step}`}
                      sx={{ "& + li": { mt: 1 } }}
                    >
                      {step}
                    </Box>
                  ))}
                </Box>
              </>
            ) : null}
          </Box>
        ) : null}
        <Typography variant="h2">Summary</Typography>
        <Typography
          {...getContentProps(result.overview)}
          color="text.secondary"
          sx={{ mt: 1.5, mb: 3 }}
        >
          {result.overview}
        </Typography>
        {result.sections.map((section, index) => (
          <Box
            component="section"
            key={`${index}-${section.title}`}
            sx={{ mb: 3 }}
          >
            <Typography variant="h3" {...getContentProps(section.title)}>
              {section.title}
            </Typography>
            {section.support === "unsupported" ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label="Not found in transcript"
                title="An automatic check could not match this point to what the speaker said. Verify it before relying on it."
                sx={{ mt: 0.75 }}
              />
            ) : null}
            <Typography
              color="text.secondary"
              {...getContentProps(section.body)}
              sx={{ mt: 1 }}
            >
              {section.body}
            </Typography>
          </Box>
        ))}
        {result.caveats.length ? (
          <Alert severity="warning">
            <AlertTitle>What to keep in mind</AlertTitle>
            <Box
              component="ul"
              {...getContentProps(result.caveats.join(" "))}
              sx={{
                m: 0,
                paddingInlineStart: 3,
                paddingInlineEnd: 0,
                listStyleType: "disc",
              }}
            >
              {result.caveats.map((caveat, index) => (
                <Box
                  component="li"
                  key={`${index}-${caveat}`}
                  sx={{ "& + li": { mt: 1 } }}
                >
                  {caveat}
                </Box>
              ))}
            </Box>
          </Alert>
        ) : null}
      </Box>
      <Paper
        variant="outlined"
        component="aside"
        sx={{
          position: { md: "sticky" },
          top: 88,
          minWidth: 0,
          p: 2.5,
          // Keeps the hover state of each moment inside the card.
          overflow: "hidden",
        }}
      >
        <Typography variant="h3" id={momentsTitleId}>
          Recommended moments
        </Typography>
        <List aria-labelledby={momentsTitleId} disablePadding sx={{ mt: 1 }}>
          {result.recommendedMoments.map((moment, index) => (
            <Box
              component="li"
              key={`${index}-${moment.startSeconds}`}
              sx={{ listStyle: "none" }}
            >
              <ListItemButton
                alignItems="flex-start"
                onClick={() => onSelectTime(moment.startSeconds)}
                aria-label={`${moment.title}, jump to transcript at ${formatTimestamp(moment.startSeconds)}`}
                {...getContentProps(`${moment.title} ${moment.reason}`)}
                sx={{ gap: 1.5, px: 1.5, mx: -1.5 }}
              >
                <Typography
                  component="time"
                  dir="ltr"
                  lang="en"
                  color="primary"
                  sx={{
                    pt: 1,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    unicodeBidi: "isolate",
                  }}
                >
                  {formatTimestamp(moment.startSeconds)}
                </Typography>
                <ListItemText
                  primary={moment.title}
                  secondary={moment.reason}
                  slotProps={{
                    primary: {
                      variant: "body2",
                      ...getContentProps(moment.title),
                      sx: { fontWeight: 600 },
                    },
                    secondary: {
                      variant: "body2",
                      ...getContentProps(moment.reason),
                      sx: { mt: 0.5 },
                    },
                  }}
                />
              </ListItemButton>
            </Box>
          ))}
        </List>
        {!result.recommendedMoments.length ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No specific moments identified.
          </Typography>
        ) : null}
      </Paper>
    </Box>
  );
}
