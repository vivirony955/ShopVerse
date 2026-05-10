// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import React from 'react';
import { useCart } from './cartContext';
import axiosInstance from './api/axiosInstance';

const CheckoutPage: React.FC = () => {
  const { cart } = useCart();

  const handleCheckout = async () => {
    try {
      const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const response = await axiosInstance.post('/orders', {
        userId: 'currentUserId', // Replace with actual user ID
        products: cart,
        total,
      });
      alert('Order placed successfully!');
    } catch (error) {
      console.error('Checkout failed', error);
      alert('Failed to place order.');
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Checkout</h1>
      <ul>
        {cart.map((item) => (
          <li key={item.id} className="mb-2">
            {item.name} - ${item.price} x {item.quantity}
          </li>
        ))}
      </ul>
      <button
        onClick={handleCheckout}
        className="bg-green-500 text-white px-4 py-2 mt-4 rounded"
      >
        Place Order
      </button>
    </div>
  );
};

export default CheckoutPage;