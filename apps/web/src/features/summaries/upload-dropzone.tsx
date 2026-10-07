import { Box, FormHelperText, Typography } from "@mui/material";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import { useId, useState } from "react";

interface UploadDropzoneProps {
  fileName: string | undefined;
  errorMessage: string | undefined;
  onFileChange: (file: File | undefined) => void;
}

export function UploadDropzone({
  fileName,
  errorMessage,
  onFileChange,
}: UploadDropzoneProps) {
  const fileInputId = useId();
  const errorId = useId();
  const [isDragging, setIsDragging] = useState(false);

  return (
    <Box>
      <Box
        component="label"
        htmlFor={fileInputId}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          // dragleave also fires when the pointer moves onto a child element.
          const enteredChild =
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget);
          if (!enteredChild) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          onFileChange(event.dataTransfer.files[0]);
        }}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minHeight: { xs: 184, md: 200 },
          gap: 1,
          p: 3,
          border: "1px dashed",
          borderColor: errorMessage ? "error.main" : "primary.main",
          borderRadius: 2,
          bgcolor: isDragging ? "action.selected" : "action.hover",
          textAlign: "center",
          cursor: "pointer",
          "&:hover": { bgcolor: "action.selected" },
          "&:focus-within": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 3,
          },
        }}
      >
        <UploadFileOutlined
          sx={{ fontSize: 32, color: "primary.main", mb: 1 }}
        />
        <Typography
          sx={{
            fontWeight: 600,
            maxWidth: "100%",
            overflowWrap: "anywhere",
          }}
        >
          {fileName ?? "Drop your video here"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {fileName ? "Choose another file" : "or choose a file"}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "var(--font-mono)" }}
        >
          MP4, MOV, WebM · Up to 1 GB
        </Typography>
        <input
          id={fileInputId}
          aria-label="Choose a video or audio file"
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={errorMessage ? true : undefined}
          className="sr-only"
          type="file"
          accept="video/*,audio/*"
          onChange={(event) => onFileChange(event.target.files?.[0])}
        />
      </Box>
      {errorMessage ? (
        <FormHelperText id={errorId} error>
          {errorMessage}
        </FormHelperText>
      ) : null}
    </Box>
  );
}
