// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MessageCircle, Plus, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import { supportApi } from "@/lib/api";
import type { SupportTicket } from "@/types";
import { Skeleton } from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";

const STATUS_COLORS: Record<SupportTicket["status"], string> = {
  OPEN: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  WAITING_ON_CUSTOMER: "bg-orange-100 text-orange-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-slate-100 text-slate-600",
};

const PRIORITY_COLORS: Record<SupportTicket["priority"], string> = {
  LOW: "text-slate-400",
  MEDIUM: "text-blue-500",
  HIGH: "text-orange-500",
  URGENT: "text-red-600",
};

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const noteMutation = useMutation({
    mutationFn: () => supportApi.addNote(ticket.id, note),
    onSuccess: () => {
      toast.success("Note added");
      setNote("");
      qc.invalidateQueries({ queryKey: ["support"] });
    },
    onError: () => toast.error("Failed to add note"),
  });

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-4 p-5 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[ticket.status]}`}
            >
              {ticket.status.replace(/_/g, " ")}
            </span>
            <span className={`text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
              {ticket.priority}
            </span>
          </div>
          <p className="font-semibold text-slate-800 truncate">{ticket.subject}</p>
          <p className="text-xs text-slate-400 mt-1">
            {new Date(ticket.createdAt).toLocaleDateString()}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <p className="text-sm text-slate-600 mb-4">{ticket.description}</p>

          {ticket.notes.filter((n) => !n.isInternal).length > 0 && (
            <div className="space-y-3 mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</p>
              {ticket.notes
                .filter((n) => !n.isInternal)
                .map((n) => (
                  <div key={n.id} className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700">
                    {n.body}
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
            </div>
          )}

          {ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a reply..."
                className="flex-1 border border-slate-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <Button
                size="sm"
                onClick={() => note.trim() && noteMutation.mutate()}
                disabled={!note.trim() || noteMutation.isPending}
              >
                Send
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewTicketForm({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => supportApi.create({ subject, description }),
    onSuccess: () => {
      toast.success("Ticket created!");
      qc.invalidateQueries({ queryKey: ["support"] });
      onClose();
    },
    onError: () => toast.error("Failed to create ticket"),
  });

  return (
    <div className="bg-white border border-violet-200 rounded-2xl p-6 mb-6 shadow-sm">
      <h3 className="font-bold text-slate-800 mb-4">New Support Ticket</h3>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <textarea
          placeholder="Describe your issue..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={!subject.trim() || !description.trim() || mutation.isPending}
          >
            Submit Ticket
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SupportPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["support"],
    queryFn: supportApi.getTickets,
  });
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-7 w-7 text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Ticket
        </Button>
      </div>

      {showForm && <NewTicketForm onClose={() => setShowForm(false)} />}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No support tickets yet</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </div>
  );
}
