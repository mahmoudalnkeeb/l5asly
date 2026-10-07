import { Alert, Snackbar } from "@mui/material";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface Notification {
  message: string;
  severity: "success" | "error";
}

// The id restarts the snackbar timer when the same message is shown twice.
interface ShownNotification extends Notification {
  id: number;
}

type Notify = (notification: Notification) => void;

const NotificationContext = createContext<Notify | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  // The last notification stays in state while the snackbar fades out, so the
  // closing alert keeps its colour and text.
  const [notification, setNotification] = useState<ShownNotification | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);

  const notify = useCallback<Notify>((next) => {
    setNotification((previous) => ({
      message: next.message,
      severity: next.severity,
      id: (previous?.id ?? 0) + 1,
    }));
    setIsOpen(true);
  }, []);

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <Snackbar
        key={notification?.id}
        open={isOpen}
        autoHideDuration={5000}
        onClose={() => setIsOpen(false)}
      >
        <Alert
          severity={notification?.severity ?? "success"}
          variant="filled"
          onClose={() => setIsOpen(false)}
        >
          {notification?.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification(): Notify {
  const notify = useContext(NotificationContext);

  if (!notify) {
    throw new Error(
      "useNotification must be used inside NotificationProvider.",
    );
  }

  return notify;
}
