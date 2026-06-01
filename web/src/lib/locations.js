import { Country, State, City } from "country-state-city";

export const getCountries = () => Country.getAllCountries();
export const getStates    = (iso) => State.getStatesOfCountry(iso);
export const getCities    = (cIso, sIso) => City.getCitiesOfState(cIso, sIso);

// Free-text search. Pass countryIso to scope (faster — ~150k cities globally).
export function searchCities(query, countryIso = null) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const pool = countryIso ? City.getCitiesOfCountry(countryIso) : City.getAllCities();
  const out = [];
  for (const c of pool) {
    if (c.name.toLowerCase().includes(q)) {
      out.push({
        label: `${c.name}, ${State.getStateByCodeAndCountry(c.stateCode, c.countryCode)?.name || c.stateCode}, ${Country.getCountryByCode(c.countryCode)?.name}`,
        city: c.name, lat: +c.latitude, lng: +c.longitude,
        countryCode: c.countryCode, stateCode: c.stateCode,
      });
      if (out.length >= 40) break;
    }
  }
  return out;
}
