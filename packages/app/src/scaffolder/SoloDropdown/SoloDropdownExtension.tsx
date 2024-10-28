import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from '@material-ui/core';
import FormControl from '@material-ui/core/FormControl';
import React from 'react';

/*
 This is the actual component that will get rendered in the form
 https://backstage.io/docs/features/software-templates/writing-custom-field-extensions/
*/
export const SoloDropdown = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema,
}: FieldExtensionComponentProps<string>) => {
  return (
    <FormControl
      margin="normal"
      required={required}
      error={rawErrors?.length > 0 && !formData}
    >
      <InputLabel id="solo-dropdown-label" htmlFor="solo-dropdown">
        {schema.title}
      </InputLabel>
      <Select
        id="solo-dropdown"
        labelId="solo-dropdown-label"
        value={formData ?? ''}
        onChange={e => {
          onChange((e as any).target?.value);
        }}
      >
        {'soloDropdownOptions' in schema &&
          Array.isArray(schema.soloDropdownOptions) &&
          schema.soloDropdownOptions.map(opt => (
            <MenuItem key={opt} value={opt}>
              {opt}
            </MenuItem>
          ))}
      </Select>
      {!!schema.description && (
        <FormHelperText id="entityName">{schema.description}</FormHelperText>
      )}
    </FormControl>
  );
};
