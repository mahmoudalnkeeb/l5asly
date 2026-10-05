import { Alert, Snackbar } from "@mui/material";
import { createContext, useContext, useState, type ReactNode } from "react";

interface Notification {
  message: string;
  severity: "success" | "error";
}

const NotificationContext = createContext<(notification: Notification) => void>(
  () => undefined,
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);
  return (
    <NotificationContext.Provider value={setNotification}>
      {children}
      <Snackbar
        open={notification !== null}
        autoHideDuration={5000}
        onClose={() => setNotification(null)}
      >
        <Alert
          severity={notification?.severity ?? "success"}
          variant="filled"
          onClose={() => setNotification(null)}
        >
          {notification?.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  return useContext(NotificationContext);
}
