// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import React from 'react';
import Image from 'next/image';

type ProductCardProps = {
  name: string;
  price: string;
  image: string;
};

const ProductCard: React.FC<ProductCardProps> = ({ name, price, image }) => {
  return (
    <div className="border rounded-lg overflow-hidden shadow-md">
      {/* `fill` because the layout uses width-100% / fixed-height-192px; the
          parent is given `relative` so next/image's absolute-positioned
          inner element resolves to its size. `sizes` hints the browser at
          the displayed width to fetch the right asset variant. */}
      <div className="relative w-full h-48">
        <Image
          src={image}
          alt={name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover"
        />
      </div>
      <div className="p-4">
        <h2 className="text-lg font-bold">{name}</h2>
        <p className="text-gray-700">{price}</p>
      </div>
    </div>
  );
};

export default ProductCard;