export interface ShopifyProperty {
  name?: string | null;
  value?: string | number | null;
}

export interface ShopifyLineItem {
  id: number | string;
  title?: string;
  quantity?: number;
  price?: string | number;
  total_discount?: string | number;
  discount_allocations?: Array<{ amount?: string | number }>;
  vendor?: string | null;
  sku?: string | null;
  product_id?: number | string | null;
  properties?: ShopifyProperty[] | null;
  product_tags?: string[] | string | null;
  tax_lines?: Array<{ price?: string | number; title?: string }>;
}

export interface ShopifyOrder {
  id: number | string;
  name?: string;
  order_number?: number | string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  gateway?: string | null;
  processed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  taxes_included?: boolean;
  shipping_lines?: Array<{ price?: string | number }>;
  line_items?: ShopifyLineItem[];
  fulfillments?: Array<{
    created_at?: string;
    line_items?: Array<{ id?: number | string }>;
  }>;
  refunds?: Array<{
    id?: number | string;
    refund_line_items?: Array<{
      line_item_id?: number | string;
      subtotal?: string | number;
    }>;
  }>;
  nirvan_adjustments?: Array<{
    type?: string;
    amount?: string | number;
    line_item_id?: number | string;
    status?: string;
    external_id?: string;
  }>;
}

export interface TransferRequest {
  amountFils: number;
  currency: "aed";
  destination: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
  transferGroup: string;
}

export interface TransferGateway {
  mode: "stripe-test" | "simulated";
  createTransfer(input: TransferRequest): Promise<{ id: string }>;
  availableAed(): Promise<number | null>;
}
