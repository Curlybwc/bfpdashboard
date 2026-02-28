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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cost_items: {
        Row: {
          active: boolean
          created_at: string
          default_total_cost: number
          id: string
          name: string
          piece_length_ft: number | null
          unit_type: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_total_cost?: number
          id?: string
          name: string
          piece_length_ft?: number | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_total_cost?: number
          id?: string
          name?: string
          piece_length_ft?: number | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_admin: boolean
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_admin?: boolean
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          created_at: string
          has_missing_estimates: boolean
          id: string
          name: string
          scope_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name: string
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name?: string
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_items: {
        Row: {
          added_after_conversion: boolean
          computed_total: number | null
          cost_item_id: string | null
          created_at: string
          description: string
          id: string
          notes: string | null
          phase_key: string | null
          pricing_status: Database["public"]["Enums"]["pricing_status"]
          qty: number | null
          scope_id: string
          status: string
          unit: string | null
          unit_cost_override: number | null
          updated_at: string
        }
        Insert: {
          added_after_conversion?: boolean
          computed_total?: number | null
          cost_item_id?: string | null
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          phase_key?: string | null
          pricing_status?: Database["public"]["Enums"]["pricing_status"]
          qty?: number | null
          scope_id: string
          status?: string
          unit?: string | null
          unit_cost_override?: number | null
          updated_at?: string
        }
        Update: {
          added_after_conversion?: boolean
          computed_total?: number | null
          cost_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          phase_key?: string | null
          pricing_status?: Database["public"]["Enums"]["pricing_status"]
          qty?: number | null
          scope_id?: string
          status?: string
          unit?: string | null
          unit_cost_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["scope_member_role"]
          scope_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["scope_member_role"]
          scope_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["scope_member_role"]
          scope_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_members_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scopes: {
        Row: {
          address: string
          baseline_locked_at: string | null
          converted_at: string | null
          converted_project_id: string | null
          created_at: string
          created_by: string
          estimated_total_snapshot: number | null
          id: string
          name: string | null
          status: Database["public"]["Enums"]["scope_status"]
          updated_at: string
        }
        Insert: {
          address: string
          baseline_locked_at?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by: string
          estimated_total_snapshot?: number | null
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["scope_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          baseline_locked_at?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by?: string
          estimated_total_snapshot?: number | null
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["scope_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scopes_converted_project_id_fkey"
            columns: ["converted_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_materials: {
        Row: {
          created_at: string
          delivered: boolean
          id: string
          name: string
          purchased: boolean
          quantity: number | null
          task_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          delivered?: boolean
          id?: string
          name: string
          purchased?: boolean
          quantity?: number | null
          task_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          delivered?: boolean
          id?: string
          name?: string
          purchased?: boolean
          quantity?: number | null
          task_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_materials_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_total_cost: number | null
          assigned_to_user_id: string | null
          claimed_at: string | null
          claimed_by_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          materials_on_site: Database["public"]["Enums"]["materials_status"]
          notes: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          room_area: string | null
          source_scope_item_id: string | null
          stage: Database["public"]["Enums"]["task_stage"]
          started_at: string | null
          started_by_user_id: string | null
          task: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          actual_total_cost?: number | null
          assigned_to_user_id?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          materials_on_site?: Database["public"]["Enums"]["materials_status"]
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          room_area?: string | null
          source_scope_item_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage"]
          started_at?: string | null
          started_by_user_id?: string | null
          task: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          actual_total_cost?: number | null
          assigned_to_user_id?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          materials_on_site?: Database["public"]["Enums"]["materials_status"]
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          room_area?: string | null
          source_scope_item_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage"]
          started_at?: string | null
          started_by_user_id?: string | null
          task?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_scope_item_id_fkey"
            columns: ["source_scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_started_by_user_id_fkey"
            columns: ["started_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["project_member_role"]
      }
      get_scope_role: {
        Args: { _scope_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["scope_member_role"]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_scope_member: {
        Args: { _scope_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      materials_status: "Yes" | "Partial" | "No"
      pricing_status: "Priced" | "Needs Pricing"
      project_member_role: "contractor" | "manager" | "read_only"
      project_status: "active" | "paused" | "complete"
      scope_member_role: "viewer" | "editor" | "manager"
      scope_status: "Draft" | "Converted" | "Archived"
      task_priority:
        | "1 – Now"
        | "2 – This Week"
        | "3 – Soon"
        | "4 – When Time"
        | "5 – Later"
      task_stage: "Ready" | "In Progress" | "Not Ready" | "Hold" | "Done"
      unit_type: "each" | "sqft" | "lf" | "piece"
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
  public: {
    Enums: {
      materials_status: ["Yes", "Partial", "No"],
      pricing_status: ["Priced", "Needs Pricing"],
      project_member_role: ["contractor", "manager", "read_only"],
      project_status: ["active", "paused", "complete"],
      scope_member_role: ["viewer", "editor", "manager"],
      scope_status: ["Draft", "Converted", "Archived"],
      task_priority: [
        "1 – Now",
        "2 – This Week",
        "3 – Soon",
        "4 – When Time",
        "5 – Later",
      ],
      task_stage: ["Ready", "In Progress", "Not Ready", "Hold", "Done"],
      unit_type: ["each", "sqft", "lf", "piece"],
    },
  },
} as const
