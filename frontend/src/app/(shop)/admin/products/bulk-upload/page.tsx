"use client";
import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, XCircle, Download } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";

const TEMPLATE_CSV = `name,slug,description,brandId,categoryId,basePrice,discountPct,images,tags
"Example T-Shirt","example-tshirt","A comfortable cotton t-shirt",1,2,599,10,"https://cdn.example.com/img1.jpg","cotton|tshirt|casual"
"Example Jeans","example-jeans","Slim-fit denim jeans",1,3,1299,0,"https://cdn.example.com/img2.jpg","denim|jeans"
`;

export default function BulkUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await adminApi.bulkUploadProducts(formData);
      setResult(res);
      toast.success(`Done: ${res.created} created, ${res.updated} updated`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Product Upload</h1>
          <p className="text-sm text-slate-500 mt-1">Upload a CSV to create or update products in bulk</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:border-violet-300 hover:text-violet-600 transition-colors"
        >
          <Download className="h-4 w-4" /> Template
        </button>
      </div>

      {/* CSV format reference */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6">
        <h3 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">CSV Format</h3>
        <div className="overflow-x-auto">
          <table className="text-xs text-slate-600 w-full">
            <thead>
              <tr className="border-b border-slate-200">
                {["name*", "slug", "description*", "brandId*", "categoryId*", "basePrice*", "discountPct", "images (pipe-sep)", "tags (pipe-sep)"].map((h) => (
                  <th key={h} className="px-2 py-1 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {["T-Shirt", "t-shirt", "Cotton tee", "1", "2", "599", "10", "url1|url2", "cotton|casual"].map((v, i) => (
                  <td key={i} className="px-2 py-1 text-slate-400 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">* required · existing slugs = update · new slugs = create</p>
      </div>

      {/* Upload area */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f?.name.endsWith(".csv")) setFile(f);
          else toast.error("Please drop a .csv file");
        }}
        className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-all"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileText className="h-10 w-10 text-violet-500" />
            <p className="font-medium text-slate-700">{file.name}</p>
            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-600">Drop CSV here or click to browse</p>
            <p className="text-xs text-slate-400">Max 5 MB</p>
          </>
        )}
      </div>

      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full mt-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-2xl transition-all"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading...
            </span>
          ) : "Upload & Process"}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6 space-y-3">
          <div className="flex gap-4">
            <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
              <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-700">{result.created}</p>
              <p className="text-xs text-emerald-600">Created</p>
            </div>
            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <CheckCircle className="h-6 w-6 text-blue-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
              <p className="text-xs text-blue-600">Updated</p>
            </div>
            <div className="flex-1 bg-red-50 border border-red-100 rounded-xl p-4 text-center">
              <XCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
              <p className="text-xs text-red-500">Errors</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-red-700 mb-2">Error details</h4>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-600">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
