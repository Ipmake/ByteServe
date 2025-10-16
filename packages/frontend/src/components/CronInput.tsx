import React, { useState } from 'react';
import { Box, TextField, MenuItem, Typography } from '@mui/material';

const minuteOptions = Array.from({ length: 60 }, (_, i) => i);
const hourOptions = Array.from({ length: 24 }, (_, i) => i);
const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
const weekdayOptions = [
  { value: '*', label: 'Any' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export interface CronInputValue {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
}

export function cronValueToString(value: CronInputValue): string {
  return `${value.minute} ${value.hour} ${value.day} ${value.month} ${value.weekday}`;
}

export function parseCronString(cron: string): CronInputValue {
  const parts = cron.split(' ');
  return {
    minute: parts[0] || '*',
    hour: parts[1] || '*',
    day: parts[2] || '*',
    month: parts[3] || '*',
    weekday: parts[4] || '*',
  };
}

interface Props {
  value: string;
  onChange: (cron: string) => void;
}

const CronInput: React.FC<Props> = ({ value, onChange }) => {
  const [cron, setCron] = useState<CronInputValue>(parseCronString(value));

  const handleChange = (field: keyof CronInputValue, val: string) => {
    const updated = { ...cron, [field]: val };
    setCron(updated);
    onChange(cronValueToString(updated));
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField
        select
        label="Minute"
        value={cron.minute}
        onChange={e => handleChange('minute', e.target.value)}
        size="small"
        sx={{ minWidth: 80 }}
      >
        <MenuItem value="*">Any</MenuItem>
        {minuteOptions.map(m => (
          <MenuItem key={m} value={String(m)}>{m}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Hour"
        value={cron.hour}
        onChange={e => handleChange('hour', e.target.value)}
        size="small"
        sx={{ minWidth: 80 }}
      >
        <MenuItem value="*">Any</MenuItem>
        {hourOptions.map(h => (
          <MenuItem key={h} value={String(h)}>{h}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Day"
        value={cron.day}
        onChange={e => handleChange('day', e.target.value)}
        size="small"
        sx={{ minWidth: 80 }}
      >
        <MenuItem value="*">Any</MenuItem>
        {dayOptions.map(d => (
          <MenuItem key={d} value={String(d)}>{d}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Month"
        value={cron.month}
        onChange={e => handleChange('month', e.target.value)}
        size="small"
        sx={{ minWidth: 80 }}
      >
        <MenuItem value="*">Any</MenuItem>
        {monthOptions.map(m => (
          <MenuItem key={m} value={String(m)}>{m}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Weekday"
        value={cron.weekday}
        onChange={e => handleChange('weekday', e.target.value)}
        size="small"
        sx={{ minWidth: 100 }}
      >
        {weekdayOptions.map(w => (
          <MenuItem key={w.value} value={w.value}>{w.label}</MenuItem>
        ))}
      </TextField>
      <Typography variant="caption" sx={{ ml: 2 }}>
        <b>{cronValueToString(cron)}</b>
      </Typography>
    </Box>
  );
};

export default CronInput;
