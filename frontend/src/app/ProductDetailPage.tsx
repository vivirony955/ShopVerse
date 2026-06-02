// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axiosInstance from './api/axiosInstance';
import { useCart } from './cartContext';

const ProductDetailPage: React.FC = () => {
  const [product, setProduct] = useState(null);
  const router = useRouter();
  const { id } = router.query;
  const { dispatch } = useCart();

  useEffect(() => {
    if (id) {
      const fetchProduct = async () => {
        const response = await axiosInstance.get(`/products/${id}`);
        setProduct(response.data);
      };
      fetchProduct();
    }
  }, [id]);

  const addToCart = () => {
    if (product) {
      dispatch({ type: 'ADD_TO_CART', payload: product });
    }
  };

  if (!product) return <div>Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{product.name}</h1>
      <p>{product.description}</p>
      <p className="text-lg font-semibold">${product.price}</p>
      <button
        onClick={addToCart}
        className="bg-blue-500 text-white px-4 py-2 mt-4 rounded"
      >
        Add to Cart
      </button>
    </div>
  );
};

export default ProductDetailPage;