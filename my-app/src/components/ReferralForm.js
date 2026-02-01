import React, { useState } from 'react';
import StepOne from './StepOne';
import StepTwo from './StepTwo';
import { parseDocuments } from '../utils/documentParser';

const EMPTY_FORM = {
  enhancedReason: '',
  specialty: '',
  urgency: '',
  patient: {
    name: '', species: '', breed: '', age: '', sex: '', weight: '', color: '', microchip: '',
  },
  client: {
    firstName: '', lastName: '', email: '', phone: '', address: '', city: '', state: '', zip: '',
  },
  referringVet: {
    clinicName: '', vetName: '', phone: '', email: '', fax: '',
  },
  attachedFiles: [],
};

export default function ReferralForm() {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [extracted, setExtracted] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleProcessAndContinue = async () => {
    setProcessing(true);
    try {
      const result = await parseDocuments(files, reason);

      // Build form data from extracted values, falling back to empty strings
      const pick = (section, key) => result[section]?.[key]?.value || '';

      setFormData({
        enhancedReason: result.enhancedReason || reason,
        specialty: '',
        urgency: '',
        patient: {
          name: pick('patient', 'name'),
          species: pick('patient', 'species'),
          breed: pick('patient', 'breed'),
          age: pick('patient', 'age'),
          sex: pick('patient', 'sex'),
          weight: pick('patient', 'weight'),
          color: pick('patient', 'color'),
          microchip: pick('patient', 'microchip'),
        },
        client: {
          firstName: pick('client', 'firstName'),
          lastName: pick('client', 'lastName'),
          email: pick('client', 'email'),
          phone: pick('client', 'phone'),
          address: pick('client', 'address'),
          city: pick('client', 'city'),
          state: pick('client', 'state'),
          zip: pick('client', 'zip'),
        },
        referringVet: {
          clinicName: pick('referringVet', 'clinicName'),
          vetName: pick('referringVet', 'vetName'),
          phone: pick('referringVet', 'phone'),
          email: pick('referringVet', 'email'),
          fax: pick('referringVet', 'fax'),
        },
        attachedFiles: files.map((f) => f.name),
      });

      setExtracted(result);
      setStep(2);
    } finally {
      setProcessing(false);
    }
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleSubmit = () => {
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="referral-container">
        <div className="success-card">
          <div className="success-icon">✔</div>
          <h2>Referral Submitted Successfully</h2>
          <p>
            The referral for <strong>{formData.patient.name || 'the patient'}</strong> has
            been submitted. The specialty team will review the case and contact{' '}
            <strong>
              {formData.client.firstName} {formData.client.lastName}
            </strong>{' '}
            to schedule an appointment.
          </p>
          <p className="ref-id">Reference #: VET-{Date.now().toString(36).toUpperCase()}</p>
          <button className="btn btn-primary" onClick={() => { setSubmitted(false); setStep(1); setReason(''); setFiles([]); setFormData(EMPTY_FORM); setExtracted(null); }}>
            Start New Referral
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="referral-container">
      <header className="referral-header">
        <h1>Specialty Veterinary Referral</h1>
        <p>Submit a new patient referral to our specialty hospital</p>
      </header>

      {/* Progress indicator */}
      <div className="progress-bar">
        <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
          <div className="progress-dot">{step > 1 ? '✓' : '1'}</div>
          <span>Upload &amp; Describe</span>
        </div>
        <div className="progress-line">
          <div className={`progress-fill ${step > 1 ? 'filled' : ''}`} />
        </div>
        <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
          <div className="progress-dot">2</div>
          <span>Review &amp; Submit</span>
        </div>
      </div>

      {processing && (
        <div className="processing-overlay">
          <div className="processing-card">
            <div className="spinner" />
            <h3>Processing Documents</h3>
            <p>Extracting patient information, client details, and medical history from {files.length} document{files.length !== 1 ? 's' : ''}...</p>
          </div>
        </div>
      )}

      {step === 1 && (
        <StepOne
          reason={reason}
          setReason={setReason}
          files={files}
          setFiles={setFiles}
          onNext={handleProcessAndContinue}
        />
      )}

      {step === 2 && (
        <StepTwo
          extracted={extracted}
          formData={formData}
          setFormData={setFormData}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
