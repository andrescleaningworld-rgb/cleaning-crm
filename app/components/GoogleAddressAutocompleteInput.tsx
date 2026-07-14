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

    // A third-party script problem (API key restriction, Places library not
    // enabled, a partial/unexpected load, etc.) must never be able to crash
    // the whole form — there's no error boundary above this component, so
    // an uncaught throw here takes down the entire page. Guard the lookup
    // and wrap construction in try/catch, and fall back to a plain input
    // (already rendered below) instead of throwing.
    const PlacesAutocomplete = window.google?.maps?.places?.Autocomplete;
    if (!PlacesAutocomplete) {
      console.error(
        "Google Places Autocomplete unavailable (google.maps.places.Autocomplete is missing) — falling back to a plain address input."
      );
      return;
    }

    let autocomplete: google.maps.places.Autocomplete;
    try {
      autocomplete = new PlacesAutocomplete(inputRef.current, {
        componentRestrictions: { country: "us" },
        fields: ["address_components", "formatted_address", "geometry"],
        bounds: SERVICE_AREA_BOUNDS,
      });
    } catch (error) {
      console.error("Failed to initialize Google Places Autocomplete:", error);
      return;
    }

    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener("place_changed", () => {
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

    return () => {
      try {
        window.google?.maps?.event?.removeListener(listener);
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
