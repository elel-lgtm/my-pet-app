export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          latitude: number | null
          longitude: number | null
          message: string
          pet_id: string
          raised_at: string
          resolved_at: string | null
          safe_zone_id: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status: Database["public"]["Enums"]["alert_status"]
          tracker_id: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          latitude?: number | null
          longitude?: number | null
          message: string
          pet_id: string
          raised_at: string
          resolved_at?: string | null
          safe_zone_id?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          tracker_id?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          latitude?: number | null
          longitude?: number | null
          message?: string
          pet_id?: string
          raised_at?: string
          resolved_at?: string | null
          safe_zone_id?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          tracker_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_safe_zone_id_fkey"
            columns: ["safe_zone_id"]
            isOneToOne: false
            referencedRelation: "safe_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_locations: {
        Row: {
          accuracy_meters: number | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          pet_id: string
          recorded_at: string
          source: Database["public"]["Enums"]["location_source"]
          speed_mps: number | null
          tracker_id: string | null
        }
        Insert: {
          accuracy_meters?: number | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          pet_id: string
          recorded_at: string
          source: Database["public"]["Enums"]["location_source"]
          speed_mps?: number | null
          tracker_id?: string | null
        }
        Update: {
          accuracy_meters?: number | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          pet_id?: string
          recorded_at?: string
          source?: Database["public"]["Enums"]["location_source"]
          speed_mps?: number | null
          tracker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_locations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_locations_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_shares: {
        Row: {
          caregiver_id: string | null
          created_at: string
          expires_at: string | null
          granted_by: string
          id: string
          invited_at: string
          invited_email: string
          permissions: Database["public"]["Enums"]["caregiver_permission"][]
          pet_id: string
          responded_at: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["pet_share_status"]
          updated_at: string
        }
        Insert: {
          caregiver_id?: string | null
          created_at?: string
          expires_at?: string | null
          granted_by: string
          id?: string
          invited_at?: string
          invited_email: string
          permissions: Database["public"]["Enums"]["caregiver_permission"][]
          pet_id: string
          responded_at?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["pet_share_status"]
          updated_at?: string
        }
        Update: {
          caregiver_id?: string | null
          created_at?: string
          expires_at?: string | null
          granted_by?: string
          id?: string
          invited_at?: string
          invited_email?: string
          permissions?: Database["public"]["Enums"]["caregiver_permission"][]
          pet_id?: string
          responded_at?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["pet_share_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_shares_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_shares_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_shares_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          breed: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          id: string
          lost_at: string | null
          name: string
          notes: string | null
          owner_id: string
          photo_url: string | null
          species: Database["public"]["Enums"]["pet_species"]
          status: Database["public"]["Enums"]["pet_status"]
          updated_at: string
        }
        Insert: {
          breed?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          id?: string
          lost_at?: string | null
          name: string
          notes?: string | null
          owner_id: string
          photo_url?: string | null
          species: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["pet_status"]
          updated_at?: string
        }
        Update: {
          breed?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          id?: string
          lost_at?: string | null
          name?: string
          notes?: string | null
          owner_id?: string
          photo_url?: string | null
          species?: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["pet_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          role: Database["public"]["Enums"]["account_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          role?: Database["public"]["Enums"]["account_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["account_role"]
          updated_at?: string
        }
        Relationships: []
      }
      safe_zones: {
        Row: {
          center_latitude: number
          center_longitude: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          notify_on_entry: boolean
          notify_on_exit: boolean
          pet_id: string
          radius_meters: number
          updated_at: string
        }
        Insert: {
          center_latitude: number
          center_longitude: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notify_on_entry?: boolean
          notify_on_exit?: boolean
          pet_id: string
          radius_meters: number
          updated_at?: string
        }
        Update: {
          center_latitude?: number
          center_longitude?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notify_on_entry?: boolean
          notify_on_exit?: boolean
          pet_id?: string
          radius_meters?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safe_zones_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      trackers: {
        Row: {
          battery_percent: number | null
          created_at: string
          firmware_version: string | null
          id: string
          label: string | null
          last_seen_at: string | null
          owner_id: string
          pet_id: string | null
          serial_number: string
          status: Database["public"]["Enums"]["tracker_status"]
          updated_at: string
        }
        Insert: {
          battery_percent?: number | null
          created_at?: string
          firmware_version?: string | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          owner_id: string
          pet_id?: string | null
          serial_number: string
          status?: Database["public"]["Enums"]["tracker_status"]
          updated_at?: string
        }
        Update: {
          battery_percent?: number | null
          created_at?: string
          firmware_version?: string | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          owner_id?: string
          pet_id?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["tracker_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trackers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trackers_pet_same_owner"
            columns: ["pet_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_role: "member" | "admin"
      alert_kind:
        | "safe_zone_exit"
        | "safe_zone_entry"
        | "low_battery"
        | "tracker_offline"
        | "pet_marked_lost"
        | "pet_found"
      alert_severity: "info" | "warning" | "critical"
      alert_status: "open" | "acknowledged" | "resolved" | "dismissed"
      caregiver_permission:
        | "view_profile"
        | "view_live_location"
        | "view_location_history"
        | "manage_safe_zones"
        | "acknowledge_alerts"
      location_source: "gps" | "network" | "manual"
      pet_share_status: "pending" | "accepted" | "revoked" | "expired"
      pet_species: "dog" | "cat" | "rabbit" | "bird" | "other"
      pet_status: "active" | "lost" | "deceased" | "archived"
      tracker_status: "active" | "inactive" | "retired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_role: ["member", "admin"],
      alert_kind: [
        "safe_zone_exit",
        "safe_zone_entry",
        "low_battery",
        "tracker_offline",
        "pet_marked_lost",
        "pet_found",
      ],
      alert_severity: ["info", "warning", "critical"],
      alert_status: ["open", "acknowledged", "resolved", "dismissed"],
      caregiver_permission: [
        "view_profile",
        "view_live_location",
        "view_location_history",
        "manage_safe_zones",
        "acknowledge_alerts",
      ],
      location_source: ["gps", "network", "manual"],
      pet_share_status: ["pending", "accepted", "revoked", "expired"],
      pet_species: ["dog", "cat", "rabbit", "bird", "other"],
      pet_status: ["active", "lost", "deceased", "archived"],
      tracker_status: ["active", "inactive", "retired"],
    },
  },
} as const
