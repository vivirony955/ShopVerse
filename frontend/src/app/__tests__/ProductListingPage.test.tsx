import { render, screen } from '@testing-library/react';
import ProductListingPage from '../ProductListingPage';
import axiosInstance from '../api/axiosInstance';
import { act } from 'react-dom/test-utils';

jest.mock('../api/axiosInstance');

describe('ProductListingPage', () => {
  it('renders a list of products', async () => {
    const mockProducts = [
      { id: 1, name: 'Product 1', price: 10 },
      { id: 2, name: 'Product 2', price: 20 },
    ];
    axiosInstance.get.mockResolvedValueOnce({ data: mockProducts });

    await act(async () => {
      render(<ProductListingPage />);
    });

    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Product 2')).toBeInTheDocument();
  });
});