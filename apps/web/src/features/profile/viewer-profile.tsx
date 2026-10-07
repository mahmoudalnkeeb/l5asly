import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { viewerProfileSchema, type ViewerProfile } from "@l5asly/contracts";

const STORAGE_KEY = "l5asly-viewer-profile";

interface ProfileState {
  profile: ViewerProfile | null;
  storageError: string | null;
}

interface ViewerProfileContextValue extends ProfileState {
  saveProfile: (profile: ViewerProfile) => void;
  clearProfile: () => void;
}

const ViewerProfileContext = createContext<
  ViewerProfileContextValue | undefined
>(undefined);

function readProfile(): ProfileState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { profile: null, storageError: null };
    }
    const storedJson: unknown = JSON.parse(stored);
    const parsed = viewerProfileSchema.safeParse(storedJson);
    if (!parsed.success) {
      return {
        profile: null,
        storageError:
          "Your saved profile has an invalid format. Save it again from Profile.",
      };
    }
    return { profile: parsed.data, storageError: null };
  } catch (error) {
    console.warn("Could not read the saved viewer profile", error);
    return {
      profile: null,
      storageError:
        "Your saved profile could not be read. Check browser storage settings and save it again.",
    };
  }
}

export function ViewerProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileState>(readProfile);

  useEffect(() => {
    function syncProfile(event: StorageEvent): void {
      // A null key means another tab cleared all storage.
      if (event.key === STORAGE_KEY || event.key === null) {
        setState(readProfile());
      }
    }
    window.addEventListener("storage", syncProfile);
    return () => window.removeEventListener("storage", syncProfile);
  }, []);

  const saveProfile = useCallback((profile: ViewerProfile): void => {
    const validated = viewerProfileSchema.parse(profile);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
    setState({ profile: validated, storageError: null });
  }, []);

  const clearProfile = useCallback((): void => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState({ profile: null, storageError: null });
  }, []);

  // Stable value so consumers only re-render when the profile itself changes.
  const value = useMemo<ViewerProfileContextValue>(
    () => ({
      profile: state.profile,
      storageError: state.storageError,
      saveProfile,
      clearProfile,
    }),
    [state, saveProfile, clearProfile],
  );

  return (
    <ViewerProfileContext.Provider value={value}>
      {children}
    </ViewerProfileContext.Provider>
  );
}

export function useViewerProfile(): ViewerProfileContextValue {
  const context = useContext(ViewerProfileContext);
  if (!context) {
    throw new Error(
      "useViewerProfile must be used inside ViewerProfileProvider.",
    );
  }
  return context;
}
