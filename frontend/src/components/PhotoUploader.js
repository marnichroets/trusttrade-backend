import { useState } from 'react';
import { Button } from './ui/button';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function PhotoUploader({ photos, setPhotos, minPhotos = 1, maxPhotos = 5, required = true, evidenceMode = false }) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    
    if (photos.length + files.length > maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
      return;
    }

    setUploading(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const endpoint = evidenceMode ? '/upload/dispute-evidence' : '/upload/photo';
        const response = await axios.post(`${API}${endpoint}`, formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        return {
          filename: response.data.filename,
          preview: URL.createObjectURL(file)
        };
      });

      const uploadedPhotos = await Promise.all(uploadPromises);
      setPhotos([...photos, ...uploadedPhotos]);
      toast.success(`${uploadedPhotos.length} photo(s) uploaded`);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {photos.map((photo, index) => (
          <div key={index} className="relative group">
            <img
              src={photo.preview}
              alt={`Upload ${index + 1}`}
              className="w-full h-32 object-cover rounded-lg border-2 border-slate-200"
            />
            <button
              type="button"
              onClick={() => removePhoto(index)}
              className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid={`remove-photo-${index}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <label className="w-full h-32 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-blue-50 transition-colors">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
              data-testid="photo-input"
            />
            {uploading ? (
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-slate-500">Uploading...</p>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 font-medium">Upload Photo</p>
                <p className="text-xs text-slate-500 mt-1">JPG, PNG, WebP</p>
              </div>
            )}
          </label>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-slate-600">
          {photos.length} of {maxPhotos} photos uploaded
          {required && photos.length < minPhotos && (
            <span className="text-red-600 ml-2">(Minimum {minPhotos} required)</span>
          )}
        </p>
        {photos.length >= minPhotos && (
          <p className="text-green-600 flex items-center gap-1">
            <ImageIcon className="w-4 h-4" />
            Ready
          </p>
        )}
      </div>
    </div>
  );
}

export default PhotoUploader;