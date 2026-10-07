import { Alert, AlertTitle, Button, Container, Stack } from "@mui/material";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  // The boundary clears its error when this value changes, such as on navigation.
  resetKey: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// React only supports catching render errors in a class component.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Page failed to render", {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  override componentDidUpdate(previousProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }

    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="error">
          <AlertTitle>This page could not be displayed</AlertTitle>
          Something went wrong while loading this page. Try again, or reload to
          get the latest version of the app.
        </Alert>
        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 3, flexWrap: "wrap", rowGap: 2 }}
        >
          <Button
            variant="contained"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </Stack>
      </Container>
    );
  }
}
