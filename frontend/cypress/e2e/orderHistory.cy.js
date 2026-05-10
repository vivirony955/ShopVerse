describe('Order History Page', () => {
  beforeEach(() => {
    // Navigate to the order history page
    cy.visit('/order-history');
  });

  it('should display a list of past orders', () => {
    cy.get('[data-testid="order-item"]').should('have.length.greaterThan', 0);
  });

  it('should allow navigation to order details', () => {
    cy.get('[data-testid="order-item"]').first().click();
    cy.url().should('include', '/order/');
  });
});