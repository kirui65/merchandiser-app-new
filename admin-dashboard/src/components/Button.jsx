import React from 'react';
export default function Button({ children, variant = 'primary', type = 'button', ...props }) {
  return (
    <button type={type} className={`ui-button ui-button-${variant}`} {...props}>
      {children}
    </button>
  );
}
