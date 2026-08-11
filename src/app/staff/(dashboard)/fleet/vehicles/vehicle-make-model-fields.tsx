'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { VEHICLE_MAKES, VEHICLE_MODELS_BY_MAKE } from '@lib/vehicle-catalog';
import { SelectOrOther } from '@/components/ui/SelectOrOther';

interface VehicleMakeModelFieldsProps {
  defaultMake?: string;
  defaultModel?: string;
}

// Model's suggestion list depends on the current Make (e.g. picking Toyota
// offers "Hilux"/"Land Cruiser"/...), so these two fields are coupled --
// bundled in one client component that owns the shared `make` state,
// rather than two independent FormField-wrapped SelectOrOthers that can't
// see each other. Renders its own label markup (matching FormField's exact
// styling) instead of being wrapped BY FormField, since that component
// clones a single label's htmlFor onto one child -- not applicable when
// this one component renders two separately-labelled fields.
export function VehicleMakeModelFields({ defaultMake = '', defaultModel = '' }: VehicleMakeModelFieldsProps) {
  const t = useTranslations('StaffVehicles');
  const [make, setMake] = useState(defaultMake);
  const modelOptions = VEHICLE_MODELS_BY_MAKE[make] ?? [];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label htmlFor="make" className="mb-1 block text-sm text-mist">
          {t('make')}
        </label>
        <SelectOrOther
          id="make"
          name="make"
          options={VEHICLE_MAKES}
          defaultValue={defaultMake}
          placeholder={t('makePlaceholder')}
          required
          onValueChange={setMake}
        />
      </div>
      <div>
        <label htmlFor="model" className="mb-1 block text-sm text-mist">
          {t('model')}
        </label>
        {/* Keyed by `make` -- when the make changes, any previously-typed
            "Other" model text for the old make would be a stale/misleading
            default for the new one, so this remounts fresh rather than
            carrying it forward. A model that IS still valid for the new
            make (rare, but e.g. two makes sharing a badge-engineered model
            name) simply gets re-offered as a preset option, not lost. */}
        <SelectOrOther
          key={make}
          id="model"
          name="model"
          options={modelOptions}
          defaultValue={make === defaultMake ? defaultModel : ''}
          placeholder={t('modelPlaceholder')}
          required
        />
      </div>
    </div>
  );
}
