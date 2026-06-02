import { Country, State, City } from "country-state-city";
export const getCountries       = () => Country.getAllCountries();
export const getStates          = (iso) => State.getStatesOfCountry(iso);
export const getCities          = (cIso, sIso) => City.getCitiesOfState(cIso, sIso);
export const getCitiesOfCountry = (iso) => City.getCitiesOfCountry(iso) || [];
