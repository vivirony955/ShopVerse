// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import React from 'react';
import ProductCard from './ProductCard';

const ProductGrid: React.FC = () => {
  const products = [
    { id: 1, name: 'Product 1', price: '$10', image: '/product1.jpg' },
    { id: 2, name: 'Product 2', price: '$20', image: '/product2.jpg' },
    { id: 3, name: 'Product 3', price: '$30', image: '/product3.jpg' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4">
      {products.map((product) => (
        <ProductCard key={product.id} {...product} />
      ))}
    </div>
  );
};

export default ProductGrid;