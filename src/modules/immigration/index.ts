// immigration module — public interface. Other modules/routes may ONLY
// import from here, never from domain/repository/service directly.
export { immigrationService } from './service';
export { CreateCountryRegulationInput, UpdateCountryRegulationInput } from './domain';
export type { CountryRegulationView } from './domain';
