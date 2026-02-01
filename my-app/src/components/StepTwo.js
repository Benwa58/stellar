import React from 'react';
import ConfidenceBadge from './ConfidenceBadge';

const EMPTY = { value: '', confidence: 'none' };

function field(extracted, key) {
  return extracted?.[key] || EMPTY;
}

function FormField({ label, id, value, confidence, onChange, type = 'text', required, options }) {
  const hasConfidence = confidence && confidence !== 'none';
  return (
    <div className={`form-field ${hasConfidence ? `field-${confidence}` : ''}`}>
      <div className="field-header">
        <label htmlFor={id}>
          {label} {required && <span className="required">*</span>}
        </label>
        {confidence && <ConfidenceBadge confidence={confidence} />}
      </div>
      {options ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={4} />
      ) : (
        <input type={type} id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export default function StepTwo({ extracted, formData, setFormData, onBack, onSubmit }) {
  const update = (section, key) => (value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  const conf = (section, key) => field(extracted?.[section], key).confidence;

  const stats = (() => {
    let high = 0, medium = 0, low = 0, empty = 0;
    for (const section of ['patient', 'client', 'referringVet']) {
      if (!extracted?.[section]) continue;
      for (const entry of Object.values(extracted[section])) {
        if (entry.confidence === 'high') high++;
        else if (entry.confidence === 'medium') medium++;
        else if (entry.confidence === 'low') low++;
      }
    }
    const allFields = [
      ...Object.values(formData.patient),
      ...Object.values(formData.client),
      ...Object.values(formData.referringVet),
    ];
    empty = allFields.filter((v) => !v || v.trim() === '').length;
    return { high, medium, low, empty };
  })();

  return (
    <div className="step-two">
      <div className="step-header">
        <div className="step-number">2</div>
        <div>
          <h2>Review &amp; Complete Referral</h2>
          <p className="step-subtitle">
            We've pre-filled fields from your uploaded documents. Please review
            all fields, verify highlighted values, and complete any missing information.
          </p>
        </div>
      </div>

      <div className="extraction-summary">
        <h4>Extraction Summary</h4>
        <div className="summary-stats">
          <div className="stat stat-high"><span className="stat-num">{stats.high}</span> High confidence</div>
          <div className="stat stat-medium"><span className="stat-num">{stats.medium}</span> Needs verification</div>
          <div className="stat stat-low"><span className="stat-num">{stats.low}</span> Low confidence</div>
          <div className="stat stat-empty"><span className="stat-num">{stats.empty}</span> Still empty</div>
        </div>
      </div>

      {/* Reason for Referral */}
      <fieldset className="form-fieldset">
        <legend>Reason for Referral</legend>
        <div className="enhanced-reason-note">
          This summary was generated from your uploaded documents. Please review and edit as needed.
        </div>
        <FormField
          label="Reason for Referral"
          id="enhancedReason"
          type="textarea"
          value={formData.enhancedReason}
          confidence={extracted?.reasonSnippets?.length > 0 ? 'medium' : 'none'}
          onChange={(val) => setFormData((prev) => ({ ...prev, enhancedReason: val }))}
          required
        />
        <FormField
          label="Specialty Service Requested"
          id="specialty"
          value={formData.specialty}
          onChange={(val) => setFormData((prev) => ({ ...prev, specialty: val }))}
          options={[
            'Surgery — Orthopedic',
            'Surgery — Soft Tissue',
            'Internal Medicine',
            'Oncology',
            'Cardiology',
            'Neurology',
            'Dermatology',
            'Ophthalmology',
            'Emergency & Critical Care',
            'Radiology / Advanced Imaging',
            'Dentistry',
            'Behavioral Medicine',
            'Other',
          ]}
        />
        <FormField
          label="Urgency"
          id="urgency"
          value={formData.urgency}
          onChange={(val) => setFormData((prev) => ({ ...prev, urgency: val }))}
          options={['Routine', 'Urgent (within 48 hrs)', 'Emergency (same day)']}
        />
      </fieldset>

      {/* Patient Information */}
      <fieldset className="form-fieldset">
        <legend>Patient Information</legend>
        <div className="field-grid">
          <FormField label="Patient Name" id="patientName" required
            value={formData.patient.name} confidence={conf('patient', 'name')}
            onChange={update('patient', 'name')} />
          <FormField label="Species" id="species" required
            value={formData.patient.species} confidence={conf('patient', 'species')}
            onChange={update('patient', 'species')}
            options={['Canine', 'Feline', 'Avian', 'Equine', 'Exotic', 'Other']} />
          <FormField label="Breed" id="breed"
            value={formData.patient.breed} confidence={conf('patient', 'breed')}
            onChange={update('patient', 'breed')} />
          <FormField label="Age" id="age"
            value={formData.patient.age} confidence={conf('patient', 'age')}
            onChange={update('patient', 'age')} />
          <FormField label="Sex" id="sex"
            value={formData.patient.sex} confidence={conf('patient', 'sex')}
            onChange={update('patient', 'sex')}
            options={['Male (Intact)', 'Male (Neutered)', 'Female (Intact)', 'Female (Spayed)', 'Unknown']} />
          <FormField label="Weight" id="weight"
            value={formData.patient.weight} confidence={conf('patient', 'weight')}
            onChange={update('patient', 'weight')} />
          <FormField label="Color / Markings" id="color"
            value={formData.patient.color} confidence={conf('patient', 'color')}
            onChange={update('patient', 'color')} />
          <FormField label="Microchip #" id="microchip"
            value={formData.patient.microchip} confidence={conf('patient', 'microchip')}
            onChange={update('patient', 'microchip')} />
        </div>
      </fieldset>

      {/* Client / Owner Information */}
      <fieldset className="form-fieldset">
        <legend>Client / Owner Information</legend>
        <div className="field-grid">
          <FormField label="First Name" id="clientFirst" required
            value={formData.client.firstName} confidence={conf('client', 'firstName')}
            onChange={update('client', 'firstName')} />
          <FormField label="Last Name" id="clientLast" required
            value={formData.client.lastName} confidence={conf('client', 'lastName')}
            onChange={update('client', 'lastName')} />
          <FormField label="Email" id="clientEmail" type="email"
            value={formData.client.email} confidence={conf('client', 'email')}
            onChange={update('client', 'email')} />
          <FormField label="Phone" id="clientPhone" type="tel" required
            value={formData.client.phone} confidence={conf('client', 'phone')}
            onChange={update('client', 'phone')} />
          <FormField label="Street Address" id="clientAddress"
            value={formData.client.address} confidence={conf('client', 'address')}
            onChange={update('client', 'address')} />
          <FormField label="City" id="clientCity"
            value={formData.client.city} confidence={conf('client', 'city')}
            onChange={update('client', 'city')} />
          <FormField label="State" id="clientState"
            value={formData.client.state} confidence={conf('client', 'state')}
            onChange={update('client', 'state')} />
          <FormField label="ZIP Code" id="clientZip"
            value={formData.client.zip} confidence={conf('client', 'zip')}
            onChange={update('client', 'zip')} />
        </div>
      </fieldset>

      {/* Referring Veterinarian */}
      <fieldset className="form-fieldset">
        <legend>Referring Veterinarian</legend>
        <div className="field-grid">
          <FormField label="Clinic / Hospital Name" id="clinicName" required
            value={formData.referringVet.clinicName} confidence={conf('referringVet', 'clinicName')}
            onChange={update('referringVet', 'clinicName')} />
          <FormField label="Veterinarian Name" id="vetName" required
            value={formData.referringVet.vetName} confidence={conf('referringVet', 'vetName')}
            onChange={update('referringVet', 'vetName')} />
          <FormField label="Phone" id="vetPhone" type="tel"
            value={formData.referringVet.phone} confidence={conf('referringVet', 'phone')}
            onChange={update('referringVet', 'phone')} />
          <FormField label="Email" id="vetEmail" type="email"
            value={formData.referringVet.email} confidence={conf('referringVet', 'email')}
            onChange={update('referringVet', 'email')} />
          <FormField label="Fax" id="vetFax" type="tel"
            value={formData.referringVet.fax} confidence={conf('referringVet', 'fax')}
            onChange={update('referringVet', 'fax')} />
        </div>
      </fieldset>

      {/* Uploaded Documents Summary */}
      <fieldset className="form-fieldset">
        <legend>Attached Documents</legend>
        {formData.attachedFiles && formData.attachedFiles.length > 0 ? (
          <ul className="attached-docs">
            {formData.attachedFiles.map((name, i) => (
              <li key={i}>📎 {name}</li>
            ))}
          </ul>
        ) : (
          <p className="no-docs">No documents attached.</p>
        )}
      </fieldset>

      <div className="step-actions">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onSubmit}>Submit Referral</button>
      </div>
    </div>
  );
}
