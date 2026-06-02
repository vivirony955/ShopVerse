// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { blogApi } from "@/lib/api";
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function BlogListPage() {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["blog"],
    queryFn: blogApi.getAll,
  });

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-slate-900 mb-2">ShopVerse Blog</h1>
      <p className="text-slate-500 mb-8">Style guides, trends, and tips from our team</p>

      {!posts || posts.length === 0 ? (
        <div className="text-center py-20 text-slate-400">No posts published yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              {post.coverImage && (
                <div className="relative h-44 w-full overflow-hidden">
                  <Image src={post.coverImage} alt={post.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}
              <div className="p-4">
                <div className="flex flex-wrap gap-1 mb-2">
                  {(post.tags as string[]).slice(0, 2).map((tag: string) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full">{tag}</span>
                  ))}
                </div>
                <h2 className="font-bold text-slate-900 group-hover:text-violet-600 transition-colors line-clamp-2">{post.title}</h2>
                {post.excerpt && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{post.excerpt}</p>}
                <p className="text-xs text-slate-400 mt-3">
                  {post.author?.firstName} {post.author?.lastName} · {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
