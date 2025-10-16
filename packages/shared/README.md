# Shared Types Package

This package contains globally declared TypeScript types/interfaces that are shared across the entire monorepo using an object-oriented approach with inheritance.

## Structure

The types are organized into three global namespaces with inheritance hierarchies:

### `Models` Namespace
Database models with inheritance for cleaner types:

**User Hierarchy:**
- `Models.BaseUser` - Base user (id, username)
  - `Models.User` - Full database model (extends BaseUser + password, enabled, dates)
  - `Models.UserPublic` - API response (extends BaseUser + safe fields only)

**File Hierarchy:**
- `Models.BaseFile` - Base file (id, filename, originalName)
  - `Models.File` - Full database model (extends BaseFile + all metadata)
  - `Models.FilePublic` - API response (extends BaseFile + public metadata)

**Other:**
- `Models.AuthToken` - Database auth token model

### `Auth` Namespace
Authentication-related types with inheritance:
- `Auth.Session` - Authenticated user session (extends BaseUser + token, isApi)
- `Auth.Credentials` - Login credentials (username, password)
- `Auth.LoginResult` - Login response (extends BaseUser + token)
- `Auth.PasswordChange` - Password change request
- `Auth.SuccessResponse` - Generic success message

### `API` Namespace
Generic API types:
- `API.Error` - Standard error response
- `API.Health` - Health check response

## Usage

The types are **globally available** across the entire monorepo. No imports needed!

### In Backend (Express)
```typescript
// routes/auth.ts
router.post('/login', async (req: Request, res: Response) => {
  const credentials: Auth.Credentials = req.body;
  
  const result: Auth.LoginResult = {
    id: user.id,
    username: user.username,
    token: newToken
  };
  
  res.json(result);
});

// Get user from DB
const user: Models.User = await prisma.user.findFirst({...});

// Return public user data
const publicUser: Models.UserPublic = {
  id: user.id,
  username: user.username,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString()
};
```

### In Frontend (React)
```typescript
// api.ts
export const apiService = {
  login: async (username: string, password: string) => {
    const response = await api.post<Auth.LoginResult>('/auth/login', { 
      username, 
      password 
    });
    return response.data;
  },
  
  getUsers: async () => {
    const response = await api.get<Models.UserPublic[]>('/users');
    return response.data;
  },
};

// Component
const [users, setUsers] = useState<Models.UserPublic[]>([]);
const [session, setSession] = useState<Auth.Session | null>(null);
```

### In Zustand Store
```typescript
interface AuthState {
  session: Auth.Session | null;
  login: (credentials: Auth.Credentials) => Promise<void>;
  logout: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  session: null,
  login: async (credentials) => {
    const result = await apiService.login(credentials.username, credentials.password);
    const session: Auth.Session = {
      id: result.id,
      username: result.username,
      token: result.token,
      isApi: false
    };
    set({ session });
  },
  logout: () => set({ session: null }),
}));
```

## Type Inheritance Benefits

### Before (Repetitive):
```typescript
interface User { id: string; username: string; email: string; ... }
interface UserResponse { id: string; username: string; email: string; ... }
interface AuthUserResponse { id: string; username: string; token: string; ... }
```

### After (DRY with Inheritance):
```typescript
interface BaseUser { id: string; username: string; }
interface User extends BaseUser { email: string; ... }
interface UserPublic extends BaseUser { email: string; ... }
interface Session extends BaseUser { token: string; isApi: boolean; }
```

## Adding New Types

1. Open `packages/shared/src/types.ts`
2. Add your interface to the appropriate namespace
3. Use `extends` for inheritance when appropriate

Example:
```typescript
declare global {
  namespace Models {
    // Base type
    interface BasePost {
      id: string;
      title: string;
    }
    
    // Database model
    interface Post extends BasePost {
      content: string;
      authorId: string;
      createdAt: Date;
    }
    
    // Public API response
    interface PostPublic extends BasePost {
      content: string;
      author: BaseUser;
      createdAt: string;
    }
  }
}
```

## Benefits

✅ **Object-Oriented**: Clean inheritance hierarchies  
✅ **DRY Principle**: No repeated fields  
✅ **Type Safety**: Catch mismatches at compile time  
✅ **No Import Hell**: Globally available types  
✅ **Consistency**: Same types across frontend and backend  
✅ **Auto-completion**: Full IntelliSense support  
✅ **Easy Updates**: Change base type, all children updated  
✅ **Semantic Naming**: Clear type purposes (Base, Public, Session, etc.)
