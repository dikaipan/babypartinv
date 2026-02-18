// ─── User / Profile ───
export type UserRole = 'admin' | 'engineer';

export interface Profile {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    location?: string | null;
    employee_id?: string | null;
    is_active: boolean;
    fcm_token?: string | null;
    created_at?: string;
    updated_at?: string;
}

// ─── Inventory (Master Parts) ───
export interface InventoryPart {
    id: string;
    part_name: string;
    total_stock: number;
    min_stock: number;
    last_updated?: string;
    created_at?: string;
    updated_at?: string;
}

// ─── Engineer Stock ───
export interface EngineerStock {
    engineer_id: string;
    part_id: string;
    quantity: number;
    min_stock?: number | null;
    last_sync?: string | null;
    created_at?: string;
    updated_at?: string;
}

// ─── Request Item (inside monthly_requests.items jsonb) ───
export interface RequestItem {
    partId: string;
    quantity: number;
}

// ─── Monthly Request ───
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'delivered' | 'completed' | 'cancelled';

export interface MonthlyRequest {
    id: string;
    engineer_id: string;
    month: string;
    items: RequestItem[];
    status: RequestStatus;
    submitted_at: string;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    rejection_reason?: string | null;
    cancelled_at?: string | null;
    delivered_at?: string | null;
    delivered_by?: string | null;
    confirmed_at?: string | null;
    last_edited_by?: string | null;
    last_edited_at?: string | null;
    // Joined fields
    engineer?: Profile;
}

// ─── Stock Adjustments ───
export interface StockAdjustment {
    id: string;
    engineer_id: string;
    engineer_name: string;
    part_id: string;
    part_name: string;
    previous_quantity: number;
    new_quantity: number;
    delta: number;
    reason?: string | null;
    timestamp: string;
    area_group?: string | null;
}

// ─── Usage Reports ───
export interface UsageReport {
    id: string;
    engineer_id: string;
    so_number: string;
    description?: string | null;
    items: UsageItem[];
    date: string;
}

export interface UsageItem {
    partId: string;
    partName?: string;
    quantity: number;
}

// ─── Notifications ───
export interface AppNotification {
    id: string;
    user_id: string;
    title: string;
    body: string;
    type: string;
    data?: Record<string, any> | null;
    is_read: boolean;
    created_at: string;
}

// ─── App Config ───
export interface AppConfig {
    id: string;
    latest_version: string;
    latest_build_number: number;
    download_url?: string | null;
    force_update: boolean;
    updated_at: string;
}
