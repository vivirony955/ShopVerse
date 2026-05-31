// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { blogApi } from "@/lib/api";
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ["blog", params?.slug],
    queryFn: () => blogApi.getBySlug(params!.slug),
    enabled: !!params?.slug,
  });

  if (isLoading) return <PageSkeleton />;
  if (isError || !post) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-slate-500">Post not found.</p>
      <Link href="/blog" className="text-violet-600 hover:underline mt-2 inline-block">← Back to Blog</Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-violet-600 transition-colors mb-6">
        <ChevronLeft className="h-4 w-4" /> Back to Blog
      </Link>

      {post.coverImage && (
        <div className="relative h-64 w-full rounded-2xl overflow-hidden mb-6">
          <Image src={post.coverImage} alt={post.title} fill className="object-cover" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {(post.tags as string[]).map((tag: string) => (
          <span key={tag} className="text-xs px-2.5 py-1 bg-violet-50 text-violet-600 rounded-full">{tag}</span>
        ))}
      </div>

      <h1 className="text-3xl font-extrabold text-slate-900 mb-3">{post.title}</h1>

      <p className="text-sm text-slate-400 mb-8">
        By {post.author?.firstName} {post.author?.lastName}
        {post.publishedAt && ` · ${new Date(post.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`}
      </p>

      {/* Render content as HTML safely */}
      <article
        className="prose prose-slate max-w-none text-slate-700 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: post.content ?? "" }}
      />
    </div>
  );
}
