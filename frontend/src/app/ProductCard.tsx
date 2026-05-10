// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import React from 'react';

type ProductCardProps = {
  name: string;
  price: string;
  image: string;
};

const ProductCard: React.FC<ProductCardProps> = ({ name, price, image }) => {
  return (
    <div className="border rounded-lg overflow-hidden shadow-md">
      <img src={image} alt={name} className="w-full h-48 object-cover" />
      <div className="p-4">
        <h2 className="text-lg font-bold">{name}</h2>
        <p className="text-gray-700">{price}</p>
      </div>
    </div>
  );
};

export default ProductCard;