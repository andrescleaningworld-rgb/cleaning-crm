"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Roughly the same NJ / NYC / tri-state service area used to sanity-check
// account pins on the map page (SERVICE_AREA_* in app/map/page.tsx) — reused
// here to bias (not restrict) Places Autocomplete suggestions.
const SERVICE_AREA_BOUNDS = {
  south: 38.5,
  north: 42.5,
  west: -76.5,
  east: -72.5,
};

export type PlaceAddressDetails = {
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
};

// Module-level flag (not component state): the script only needs to be
// injected once per page load. next/script's onReady fires on every mount,
// so late-mounting instances of this component still get notified.
let googleMapsScriptReady = false;

const IMPORT_LIBRARY_POLL_MS = 100;
const IMPORT_LIBRARY_MAX_ATTEMPTS = 50; // ~5s total

// next/script's onReady (the <script> tag's native `load` event) fires once
// the bootstrap loader itself has downloaded — but with loading=async that
// loader still attaches google.maps.importLibrary asynchronously after that,
// so onReady alone isn't proof it's ready yet (confirmed live: the very same
// window.google.maps.importLibrary check that failed here existed and
// worked moments later). Poll instead of trusting the single event.
function waitForImportLibrary(): Promise<typeof google.maps.importLibrary | null> {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      const importLibrary = window.google?.maps?.importLibrary;
      if (importLibrary) {
        resolve(importLibrary);
        return;
      }
      attempts += 1;
      if (attempts >= IMPORT_LIBRARY_MAX_ATTEMPTS) {
        resolve(null);
        return;
      }
      setTimeout(check, IMPORT_LIBRARY_POLL_MS);
    };
    check();
  });
}

function getAddressComponent(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  types: string[],
  useShortName = false
) {
  for (const type of types) {
    const match = components?.find((component) =>
      component.types.includes(type)
    );
    if (match) return useShortName ? match.short_name : match.long_name;
  }
  return "";
}

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected: (details: PlaceAddressDetails) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
};

export default function GoogleAddressAutocompleteInput({
  id,
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  className,
  required,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(
    null
  );
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected;
    onChangeRef.current = onChange;
  });

  const [scriptReady, setScriptReady] = useState(googleMapsScriptReady);

  useEffect(() => {
    if (!scriptReady || !inputRef.current || autocompleteRef.current) return;

    let cancelled = false;
    let listener: google.maps.MapsEventListener | undefined;

    waitForImportLibrary().then((importLibrary) => {
      // Effect may have been cleaned up (unmount/remount) while polling.
      if (cancelled) return;

      if (!importLibrary) {
        console.error(
          `google.maps.importLibrary still unavailable after polling for ~${
            (IMPORT_LIBRARY_MAX_ATTEMPTS * IMPORT_LIBRARY_POLL_MS) / 1000
          }s — falling back to a plain address input.`
        );
        return;
      }

      importLibrary("places")
        .then((library) => {
          // Effect may have been cleaned up (unmount/remount) while the
          // import was in flight, or another mount already won the race.
          if (cancelled || !inputRef.current || autocompleteRef.current) return;

          const { Autocomplete } = library as google.maps.PlacesLibrary;

          let autocomplete: google.maps.places.Autocomplete;
          try {
            autocomplete = new Autocomplete(inputRef.current, {
              componentRestrictions: { country: "us" },
              fields: ["address_components", "formatted_address", "geometry"],
              bounds: SERVICE_AREA_BOUNDS,
            });
          } catch (error) {
            console.error("Failed to initialize Google Places Autocomplete:", error);
            return;
          }

          autocompleteRef.current = autocomplete;

          listener = autocomplete.addListener("place_changed", () => {
            try {
              const place = autocomplete.getPlace();
              const components = place.address_components;

              const address =
                place.formatted_address || inputRef.current?.value || "";
              const city = getAddressComponent(components, [
                "locality",
                "sublocality",
                "postal_town",
                "administrative_area_level_3",
              ]);
              const state = getAddressComponent(
                components,
                ["administrative_area_level_1"],
                true
              );
              const zip = getAddressComponent(components, ["postal_code"]);
              const latitude = place.geometry?.location?.lat();
              const longitude = place.geometry?.location?.lng();

              onChangeRef.current(address);
              onPlaceSelectedRef.current({
                address,
                city,
                state,
                zip,
                latitude: latitude !== undefined ? String(latitude) : "",
                longitude: longitude !== undefined ? String(longitude) : "",
              });
            } catch (error) {
              console.error("Error handling Google Places selection:", error);
            }
          });
        })
        .catch((error) => {
          console.error("Failed to load Google Places library:", error);
        });
    });

    return () => {
      cancelled = true;
      try {
        if (listener) window.google?.maps?.event?.removeListener(listener);
      } catch {
        // Best-effort cleanup only — never let this throw during unmount.
      }
      autocompleteRef.current = null;
    };
  }, [scriptReady]);

  const inputElement = (
    <input
      id={id}
      ref={inputRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={className}
      required={required}
      autoComplete="off"
    />
  );

  if (!GOOGLE_MAPS_API_KEY) {
    return inputElement;
  }

  return (
    <>
      <Script
        id="google-maps-places"
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`}
        strategy="afterInteractive"
        onReady={() => {
          googleMapsScriptReady = true;
          setScriptReady(true);
        }}
      />
      {inputElement}
    </>
  );
}
