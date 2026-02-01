import React, { useRef } from 'react';

export default function StepOne({ reason, setReason, files, setFiles, onNext }) {
  const fileInputRef = useRef(null);

  const handleFiles = (e) => {
    const incoming = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...incoming]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const incoming = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...incoming]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const fileIcon = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📄';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['dicom', 'dcm'].includes(ext)) return '🩻';
    return '📎';
  };

  const canProceed = reason.trim().length > 0 || files.length > 0;

  return (
    <div className="step-one">
      <div className="step-header">
        <div className="step-number">1</div>
        <div>
          <h2>Referral Information</h2>
          <p className="step-subtitle">
            Provide the reason for referral and upload any supporting documents.
            We'll use uploaded files to pre-fill the referral form.
          </p>
        </div>
      </div>

      <div className="form-section">
        <label className="form-label" htmlFor="reason">
          Reason for Referral <span className="required">*</span>
        </label>
        <textarea
          id="reason"
          className="reason-textarea"
          placeholder="Describe the reason for referral, including presenting complaint, relevant history, and what specialty service is being requested..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={5}
        />
        <p className="form-hint">
          This will be enhanced with information extracted from your uploaded documents.
        </p>
      </div>

      <div className="form-section">
        <label className="form-label">Documents &amp; Attachments</label>
        <div
          className="dropzone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="dropzone-content">
            <span className="dropzone-icon">☁️</span>
            <p className="dropzone-text">
              Drag &amp; drop files here, or <span className="dropzone-link">browse</span>
            </p>
            <p className="dropzone-hint">
              Medical records, lab results, imaging reports, referral letters, radiographs (PDF, DOC, JPG, PNG, DICOM)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.tiff,.bmp,.csv,.xls,.xlsx,.dcm,.dicom,.txt"
            onChange={handleFiles}
            style={{ display: 'none' }}
          />
        </div>

        {files.length > 0 && (
          <ul className="file-list">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="file-item">
                <span className="file-icon">{fileIcon(file.name)}</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatSize(file.size)}</span>
                <button
                  className="file-remove"
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  title="Remove file"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="step-actions">
        <button className="btn btn-primary" disabled={!canProceed} onClick={onNext}>
          {files.length > 0 ? 'Process Documents & Continue' : 'Continue Without Documents'}
        </button>
      </div>
    </div>
  );
}
