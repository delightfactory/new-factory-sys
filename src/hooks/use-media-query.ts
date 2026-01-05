import * as React from "react";

/**
 * Custom hook to detect if a media query matches
 * @param query - CSS media query string
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = React.useState<boolean>(() => {
        // Check if window is available (for SSR)
        if (typeof window !== "undefined") {
            return window.matchMedia(query).matches;
        }
        return false;
    });

    React.useEffect(() => {
        if (typeof window === "undefined") return;

        const mediaQueryList = window.matchMedia(query);

        // Update state initially
        setMatches(mediaQueryList.matches);

        // Create listener function
        const listener = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        // Add listener
        mediaQueryList.addEventListener("change", listener);

        // Cleanup
        return () => {
            mediaQueryList.removeEventListener("change", listener);
        };
    }, [query]);

    return matches;
}

/**
 * Hook to detect if the current viewport is mobile
 * @returns boolean - true if viewport is mobile (< 640px)
 */
export function useIsMobile(): boolean {
    return !useMediaQuery("(min-width: 640px)");
}

/**
 * Hook to detect if the current viewport is tablet or larger
 * @returns boolean - true if viewport is tablet or larger (>= 768px)
 */
export function useIsTablet(): boolean {
    return useMediaQuery("(min-width: 768px)");
}

/**
 * Hook to detect if the current viewport is desktop
 * @returns boolean - true if viewport is desktop (>= 1024px)
 */
export function useIsDesktop(): boolean {
    return useMediaQuery("(min-width: 1024px)");
}
