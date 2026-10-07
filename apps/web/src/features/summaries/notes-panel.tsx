import { Box, Divider, Typography } from "@mui/material";

import type { SummaryNote } from "@l5asly/contracts";
import { getContentProps } from "./format";

export function NotesPanel({ notes }: { notes: SummaryNote[] }) {
  return (
    <Box sx={{ maxWidth: 800 }}>
      <Typography variant="h2" sx={{ mb: 2 }}>
        Key notes
      </Typography>
      {!notes.length ? (
        <Typography color="text.secondary">
          No additional source notes for this answer.
        </Typography>
      ) : null}
      {notes.map((note, index) => (
        <Box
          component="article"
          key={`${index}-${note.category}-${note.title}`}
          sx={{ py: 2 }}
        >
          <Typography
            variant="caption"
            color="primary"
            {...getContentProps(note.category)}
          >
            {note.category}
          </Typography>
          <Typography
            variant="h3"
            {...getContentProps(note.title)}
            sx={{ mt: 0.5 }}
          >
            {note.title}
          </Typography>
          <Typography
            color="text.secondary"
            {...getContentProps(note.detail)}
            sx={{ mt: 1, mb: 2 }}
          >
            {note.detail}
          </Typography>
          <Divider />
        </Box>
      ))}
    </Box>
  );
}
