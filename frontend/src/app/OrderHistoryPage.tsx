// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import React, { useEffect, useState } from 'react';
import axiosInstance from './api/axiosInstance';

const OrderHistoryPage: React.FC = () => {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const fetchOrders = async () => {
      const response = await axiosInstance.get('/orders');
      setOrders(response.data);
    };
    fetchOrders();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Order History</h1>
      <ul>
        {orders.map((order) => (
          <li key={order.id} className="mb-4">
            <p>Order ID: {order.id}</p>
            <p>Total: ${order.total}</p>
            <p>Status: {order.status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OrderHistoryPage;