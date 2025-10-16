import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
  Collapse,
  MenuItem,
  Select,
  SelectChangeEvent,
} from '@mui/material';

interface QuotaInputProps {
  value: number; // -1 for unlimited
  onChange: (value: number) => void;
  label?: string;
  helperText?: string;
}

const units = [
  { label: 'KB (Kilobytes)', value: 1024, shortLabel: 'KB' },
  { label: 'MB (Megabytes)', value: 1024 * 1024, shortLabel: 'MB' },
  { label: 'GB (Gigabytes)', value: 1024 * 1024 * 1024, shortLabel: 'GB' },
  { label: 'TB (Terabytes)', value: 1024 * 1024 * 1024 * 1024, shortLabel: 'TB' },
  { label: 'PB (Petabytes)', value: 1024 * 1024 * 1024 * 1024 * 1024, shortLabel: 'PB' },
];

export default function QuotaInput({ value, onChange, label = 'Storage Quota', helperText }: QuotaInputProps) {
  const [isUnlimited, setIsUnlimited] = useState(value === -1);
  const [inputValue, setInputValue] = useState('10');
  const [selectedUnit, setSelectedUnit] = useState('GB');

  useEffect(() => {
    if (value === -1) {
      setIsUnlimited(true);
    } else {
      setIsUnlimited(false);
      // Convert bytes to the most appropriate unit
      if (value >= units[4].value) {
        const pb = value / units[4].value;
        setInputValue(pb.toString());
        setSelectedUnit('PB');
      } else if (value >= units[3].value) {
        const tb = value / units[3].value;
        setInputValue(tb.toString());
        setSelectedUnit('TB');
      } else if (value >= units[2].value) {
        const gb = value / units[2].value;
        setInputValue(gb.toString());
        setSelectedUnit('GB');
      } else if (value >= units[1].value) {
        const mb = value / units[1].value;
        setInputValue(mb.toString());
        setSelectedUnit('MB');
      } else {
        const kb = value / units[0].value;
        setInputValue(kb.toString());
        setSelectedUnit('KB');
      }
    }
  }, [value]);

  const handleUnlimitedToggle = (checked: boolean) => {
    setIsUnlimited(checked);
    if (checked) {
      onChange(-1);
    } else {
      const numValue = parseFloat(inputValue) || 10;
      const unit = units.find(u => u.shortLabel === selectedUnit) || units[2];
      onChange(Math.floor(numValue * unit.value));
    }
  };

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    const numValue = parseFloat(newValue);
    if (!isNaN(numValue) && numValue > 0 && !isUnlimited) {
      const unit = units.find(u => u.shortLabel === selectedUnit) || units[2];
      onChange(Math.floor(numValue * unit.value));
    }
  };

  const handleUnitChange = (event: SelectChangeEvent<string>) => {
    const newUnit = event.target.value;
    if (newUnit && !isUnlimited) {
      setSelectedUnit(newUnit);
      const numValue = parseFloat(inputValue) || 10;
      const unit = units.find(u => u.shortLabel === newUnit) || units[2];
      onChange(Math.floor(numValue * unit.value));
    }
  };

  return (
    <Box>
      <FormControlLabel
        control={
          <Switch
            checked={isUnlimited}
            onChange={(e) => handleUnlimitedToggle(e.target.checked)}
          />
        }
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">Unlimited Storage</Typography>
          </Box>
        }
      />

      <Collapse in={!isUnlimited}>
        <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <TextField
            label={label}
            type="number"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            size="small"
            inputProps={{
              min: 0.1,
              step: 0.1,
            }}
            sx={{ flex: 1 }}
            helperText={helperText}
          />
          <Select
            value={selectedUnit}
            onChange={handleUnitChange}
            size="small"
            sx={{ minWidth: 180 }}
          >
            {units.map((unit) => (
              <MenuItem key={unit.shortLabel} value={unit.shortLabel}>
                {unit.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Collapse>
    </Box>
  );
}
