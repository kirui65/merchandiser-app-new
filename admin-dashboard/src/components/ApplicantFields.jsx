import React from 'react';

export const educationOptions = [['KCPE', 'KCPE'], ['KCSE', 'KCSE'], ['certificate', 'Certificate'], ['diploma', 'Diploma'], ['degree', 'Degree'], ['postgraduate', 'Postgraduate'], ['other', 'Other higher']];
export const passportOptions = [['has_passport', 'I have a passport'], ['will_get_self_funded', 'I will get one myself'], ['not_ready', 'I am not ready yet']];
export const nitaOptions = [['not_paid', 'Not paid'], ['paid', 'Paid']];

function SelectField({ label, value, onChange, options, className }) {
  return <label className={className}><span>{label}</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select one</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

export default function ApplicantFields({ form, update, className = 'public-field', includeHoneypot = false }) {
  return <>
    <label className={className}><span>Full name</span><input required autoComplete="name" maxLength={160} value={form.applicantName} onChange={(event) => update('applicantName', event.target.value)} /></label>
    <label className={className}><span>National ID number</span><input required inputMode="numeric" pattern="[0-9]{7,10}" maxLength={10} autoComplete="off" value={form.applicantIdNumber} onChange={(event) => update('applicantIdNumber', event.target.value.replace(/\D/g, ''))} /><small>Digits only. Your information is handled securely.</small></label>
    <label className={className}><span>Phone number</span><input required type="tel" autoComplete="tel" maxLength={24} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></label>
    <label className={className}><span>Email address</span><input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
    <label className={className}><span>County</span><input required autoComplete="address-level1" maxLength={100} value={form.county} onChange={(event) => update('county', event.target.value)} /></label>
    <SelectField className={className} label="Highest education completed" value={form.education} onChange={(value) => update('education', value)} options={educationOptions} />
    <SelectField className={className} label="Passport readiness" value={form.passportStatus} onChange={(value) => update('passportStatus', value)} options={passportOptions} />
    <SelectField className={className} label="NITA fee status" value={form.nitaFeeStatus} onChange={(value) => update('nitaFeeStatus', value)} options={nitaOptions} />
    {includeHoneypot && <div className="public-honeypot" aria-hidden="true"><label>Company website<input tabIndex="-1" autoComplete="off" value={form.companyWebsite || ''} onChange={(event) => update('companyWebsite', event.target.value)} /></label></div>}
  </>;
}
