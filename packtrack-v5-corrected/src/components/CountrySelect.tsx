/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

/**
 * Country free-text input component (no dropdown).
 */
export default function CountrySelect({
  value,
  onChange,
  required = false,
  className = '',
  placeholder = 'e.g. Sri Lanka, Kenya, Vietnam...',
  id
}: CountrySelectProps) {
  return (
    <input
      type="text"
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className={`w-full bg-surface-hover border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-medium transition-colors ${className}`}
    />
  );
}
