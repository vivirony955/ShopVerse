describe('Checkout Page', () => {
  beforeEach(() => {
    // Navigate to the checkout page
    cy.visit('/checkout');
  });

  it('should display the checkout form', () => {
    cy.get('[data-testid="checkout-form"]').should('exist');
  });

  it('should validate form fields', () => {
    cy.get('[data-testid="submit-button"]').click();
    cy.get('[data-testid="error-message"]').should('exist');
  });

  it('should submit the form successfully', () => {
    cy.get('[data-testid="name-input"]').type('John Doe');
    cy.get('[data-testid="address-input"]').type('123 Main St');
    cy.get('[data-testid="submit-button"]').click();
    cy.get('[data-testid="success-message"]').should('exist');
  });
});